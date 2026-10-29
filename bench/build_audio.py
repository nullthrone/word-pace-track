"""Build the speech bench audio: real speeches (VoxPopuli) and synthetic ones (Piper TTS).

For every clip in bench/corpus.json this writes <out>/<id>.wav (16 kHz mono) and <id>.truth.json:
the reference text of each segment and when, in the WAV, its speech starts and ends.

    python3 -m venv bench/.venv
    bench/.venv/bin/pip install piper-tts pyarrow fsspec aiohttp requests
    bench/.venv/bin/python bench/build_audio.py [--out bench/.cache] [--only id,id]

Needs ffmpeg. Downloads are cached in <out>/dl; the parquet file is read by row group, not whole.
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import urllib.request
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RATE = 16000
LEAD_S, TAIL_S = 1.0, 2.0
FRAME = RATE // 50  # 20 ms


def decode(data):
    """Any audio file (bytes) -> float32 mono at RATE, via ffmpeg."""
    out = subprocess.run(
        ['ffmpeg', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', str(RATE), 'pipe:1'],
        input=data, stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(out, dtype=np.int16).astype(np.float32) / 32768


def voiced_span(x):
    """First and last 20 ms frame within 35 dB of the loudest one: trims leading and trailing silence."""
    n = len(x) // FRAME
    if n == 0:
        return 0, len(x)
    rms = np.sqrt(np.mean(x[:n * FRAME].reshape(n, FRAME) ** 2, axis=1)) + 1e-9
    db = 20 * np.log10(rms)
    on = np.nonzero(db > max(db.max() - 35, -55))[0]
    return int(on[0]) * FRAME, int(on[-1] + 1) * FRAME


def assemble(clip_id, parts, gaps, out, meta):
    """parts: [(audio, text, paragraph_end)]. Writes the WAV and the truth file."""
    pieces, segments, pos = [np.zeros(int(LEAD_S * RATE), np.float32)], [], int(LEAD_S * RATE)
    for k, (audio, text, para) in enumerate(parts):
        a, b = voiced_span(audio)
        segments.append({'startMs': round((pos + a) / RATE * 1000), 'endMs': round((pos + b) / RATE * 1000), 'text': text})
        pieces.append(audio)
        pos += len(audio)
        if k < len(parts) - 1:
            gap = 3.0 if para else gaps[k % len(gaps)]
            pieces.append(np.zeros(int(gap * RATE), np.float32))
            pos += int(gap * RATE)
    pieces.append(np.zeros(int(TAIL_S * RATE), np.float32))
    pcm = np.clip(np.concatenate(pieces), -1, 1)
    with wave.open(os.path.join(out, clip_id + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((pcm * 32767).astype(np.int16).tobytes())
    truth = dict(meta, id=clip_id, durationMs=round(len(pcm) / RATE * 1000), segments=segments)
    with open(os.path.join(out, clip_id + '.truth.json'), 'w', encoding='utf-8') as f:
        json.dump(truth, f, ensure_ascii=False, indent=1)
    words = sum(len(s['text'].split()) for s in segments)
    span = (segments[-1]['endMs'] - segments[0]['startMs']) / 60000
    print(f'{clip_id}: {len(segments)} segments, {words} words, {span * 60:.0f} s, {words / span:.0f} WPM over total time')


def fetch(url, path):
    if not os.path.exists(path):
        print('download', url, file=sys.stderr)
        urllib.request.urlretrieve(url, path + '.part')
        os.replace(path + '.part', path)
    return path


def build_voxpopuli(cfg, gaps, out, only):
    import fsspec
    import pyarrow.parquet as pq
    speeches = [s for s in cfg['speeches'] if not only or s['id'] in only]
    if not speeches:
        return
    want = {seg for s in speeches for seg in s['segments']}
    found = {}
    pf = pq.ParquetFile(fsspec.open(cfg['url'], block_size=2 ** 22).open())
    for rg in range(pf.metadata.num_row_groups):
        ids = pf.read_row_group(rg, columns=['audio_id']).column('audio_id').to_pylist()
        if want.isdisjoint(ids):
            continue
        for row in pf.read_row_group(rg, columns=['audio_id', 'raw_text', 'audio']).to_pylist():
            if row['audio_id'] in want:
                found[row['audio_id']] = (decode(row['audio']['bytes']), row['raw_text'])
    for s in speeches:
        missing = [seg for seg in s['segments'] if seg not in found]
        if missing:
            sys.exit(f'{s["id"]}: segments not found: {missing}')
        parts = [(found[seg][0], found[seg][1], False) for seg in s['segments']]
        meta = {'lang': cfg['lang'], 'kind': 'voxpopuli', 'source': s['segments'][0].rsplit('_', 1)[0], 'license': cfg['license']}
        assemble(s['id'], parts, gaps, out, meta)


def build_tts(cfg, gaps, out, only):
    clips = [c for c in cfg['clips'] if not only or c['id'] in only]
    if not clips:
        return
    from piper import PiperVoice, SynthesisConfig
    dl = os.path.join(out, 'dl')
    voices = {}
    for c in clips:
        if c['voice'] not in voices:
            name = os.path.basename(c['voice'])
            fetch(cfg['voiceUrl'] + c['voice'] + '.onnx.json', os.path.join(dl, name + '.onnx.json'))
            voices[c['voice']] = PiperVoice.load(fetch(cfg['voiceUrl'] + c['voice'] + '.onnx', os.path.join(dl, name + '.onnx')))
        voice = voices[c['voice']]
        with open(os.path.join(HERE, c['text']), encoding='utf-8') as f:
            paragraphs = [p.strip() for p in f.read().split('\n\n') if p.strip()]
        parts = []
        for p in paragraphs:
            sentences = re.split(r'(?<=[.?!])\s+', p)
            for k, sentence in enumerate(sentences):
                buf = io.BytesIO()
                with wave.open(buf, 'wb') as w:
                    voice.synthesize_wav(sentence, w, syn_config=SynthesisConfig(length_scale=c['lengthScale']))
                parts.append((decode(buf.getvalue()), sentence, k == len(sentences) - 1))
        meta = {'lang': c['lang'], 'kind': 'tts', 'source': f'{os.path.basename(c["voice"])}, length_scale {c["lengthScale"]}, {c["text"]}', 'license': 'MIT (text), synthetic voice'}
        assemble(c['id'], parts, gaps, out, meta)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(HERE, '.cache'))
    ap.add_argument('--only', default='', help='comma-separated clip ids')
    args = ap.parse_args()
    only = set(filter(None, args.only.split(',')))
    os.makedirs(os.path.join(args.out, 'dl'), exist_ok=True)
    with open(os.path.join(HERE, 'corpus.json'), encoding='utf-8') as f:
        corpus = json.load(f)
    build_voxpopuli(corpus['voxpopuli'], corpus['gaps'], args.out, only)
    build_tts(corpus['tts'], corpus['gaps'], args.out, only)


if __name__ == '__main__':
    main()
