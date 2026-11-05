#!/usr/bin/env bash
# Голос: быстрее, ниже и бархатнее, без звона синтеза, с эхо. Исходники — store/video/vo-raw, результат — store/video/vo.
set -euo pipefail
IR=$1; cd "$2"; RAW=${3:-vo-raw}; OUT=${4:-vo}; mkdir -p "$OUT"
for f in "$RAW"/*.mp3; do
  n=$(basename "$f")
  ffmpeg -y -loglevel error -i "$f" -i "$IR" -filter_complex "
    [0:a]aresample=44100,aformat=channel_layouts=mono,rubberband=tempo=1.18:pitch=0.93:formant=preserved:transients=smooth:window=long,
      highpass=f=75,
      deesser=i=0.5:m=0.5:f=0.45,
      equalizer=f=160:t=q:w=0.9:g=4,equalizer=f=320:t=q:w=1:g=2,
      equalizer=f=2600:t=q:w=1.1:g=-2.5,equalizer=f=4700:t=q:w=1.2:g=-5,equalizer=f=7500:t=q:w=1:g=-6,
      lowpass=f=9000:p=2,
      chorus=0.9:0.95:18|27:0.22|0.16:0.35|0.27:1.6|2.1,
      acompressor=threshold=-22dB:ratio=3:attack=12:release=160:makeup=2.5,
      aformat=channel_layouts=stereo,asplit=3[dry][fx][ec];
    [fx]apad=pad_dur=1.1[fxp];[fxp][1:a]afir=dry=0:wet=1,volume=0.55[rev];
    [ec]apad=pad_dur=1.1,aecho=1:1:190|380:0.26|0.12,volume=0.9[echo];
    [dry]apad=pad_dur=1.1[dp];
    [dp][rev][echo]amix=inputs=3:weights=0.75 0.35 0.35:normalize=0,
    silenceremove=stop_periods=-1:stop_threshold=-50dB:stop_duration=0.5,
    loudnorm=I=-16:TP=-1.5:LRA=9" -ar 44100 -b:a 192k "$OUT/$n"
done
