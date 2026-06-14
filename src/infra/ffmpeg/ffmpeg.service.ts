import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Ffmpeg = require('fluent-ffmpeg') as typeof import('fluent-ffmpeg');

Ffmpeg.setFfmpegPath(ffmpegInstaller.path);
Ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface QualityPreset {
  label: string;
  maxLongSide: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

type ResolvedQualityPreset = QualityPreset & {
  width: number;
  height: number;
};

export interface TranscodeVariantResult {
  label: string;
  width: number;
  height: number;
  bitrateKbps: number;
  playlistPath: string;
}

export interface TranscodeResult {
  masterPlaylistPath: string;
  variants: TranscodeVariantResult[];
  source: VideoSourceMetadata;
}

export interface VideoSourceMetadata {
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

interface VideoProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  tags?: {
    rotate?: string;
  };
  side_data_list?: Array<{
    rotation?: number;
  }>;
}

interface VideoProbeData {
  format?: {
    duration?: number;
  };
  streams?: VideoProbeStream[];
}

const QUALITY_PRESETS: QualityPreset[] = [
  {
    label: '360p',
    maxLongSide: 640,
    videoBitrateKbps: 800,
    audioBitrateKbps: 96,
  },
  {
    label: '720p',
    maxLongSide: 1280,
    videoBitrateKbps: 2800,
    audioBitrateKbps: 128,
  },
  {
    label: '1080p',
    maxLongSide: 1920,
    videoBitrateKbps: 5000,
    audioBitrateKbps: 192,
  },
];

const HLS_SEGMENT_DURATION = 6;

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  /**
   * Transcode a video file to multi-quality HLS.
   * Produces: outputDir/360p/, outputDir/720p/, outputDir/1080p/, outputDir/master.m3u8
   */
  async transcode(
    inputPath: string,
    outputDir: string,
  ): Promise<TranscodeResult> {
    this.logger.log(`Starting HLS transcode: ${inputPath} → ${outputDir}`);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const source = await this.probeSource(inputPath);
    const presets = this.buildVariantPresets(source);
    const variants: TranscodeVariantResult[] = [];

    for (const preset of presets) {
      const variantDir = path.join(outputDir, preset.label);
      await fs.promises.mkdir(variantDir, { recursive: true });
      const playlistPath = path.join(variantDir, 'index.m3u8');

      await this.transcodeVariant(inputPath, variantDir, playlistPath, preset);

      variants.push({
        label: preset.label,
        width: preset.width,
        height: preset.height,
        bitrateKbps: preset.videoBitrateKbps,
        playlistPath,
      });

      this.logger.log(`Transcoded variant ${preset.label}`);
    }

    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
    await this.writeMasterPlaylist(masterPlaylistPath, variants);

    this.logger.log(`HLS transcode complete: ${masterPlaylistPath}`);
    return { masterPlaylistPath, variants, source };
  }

  /**
   * Generate a thumbnail JPEG from a video at a given timestamp.
   */
  async generateThumbnail(
    inputPath: string,
    outputPath: string,
    timeSec: number = 1,
  ): Promise<void> {
    this.logger.log(`Generating thumbnail at ${timeSec}s from ${inputPath}`);

    const outputDir = path.dirname(outputPath);
    const outputFile = path.basename(outputPath);

    await new Promise<void>((resolve, reject) => {
      Ffmpeg(inputPath)
        .screenshots({
          timestamps: [timeSec],
          filename: outputFile,
          folder: outputDir,
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });

    this.logger.log(`Thumbnail written to ${outputPath}`);
  }

  private transcodeVariant(
    inputPath: string,
    variantDir: string,
    playlistPath: string,
    preset: ResolvedQualityPreset,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(preset.videoBitrateKbps)
        .audioBitrate(preset.audioBitrateKbps)
        .outputOptions([
          '-preset veryfast',
          '-profile:v main',
          '-pix_fmt yuv420p',
          `-vf scale=${preset.width}:${preset.height},setsar=1`,
          '-g 48',
          '-keyint_min 48',
          '-sc_threshold 0',
          '-start_number 0',
          `-hls_time ${HLS_SEGMENT_DURATION}`,
          '-hls_list_size 0',
          '-hls_segment_type mpegts',
          `-hls_segment_filename ${path.join(variantDir, 'seg%03d.ts')}`,
          '-f hls',
        ])
        .output(playlistPath)
        .on('start', (cmd: string) => this.logger.debug(`ffmpeg cmd: ${cmd}`))
        .on('progress', (progress: { percent?: number }) => {
          if (progress.percent !== undefined) {
            this.logger.debug(
              `[${preset.label}] ${Math.floor(progress.percent)}%`,
            );
          }
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });
  }

  private probeSource(inputPath: string): Promise<VideoSourceMetadata> {
    return new Promise((resolve, reject) => {
      Ffmpeg.ffprobe(inputPath, (err: Error | null, data: VideoProbeData) => {
        if (err) {
          reject(err);
          return;
        }

        const stream = data.streams?.find(
          (item) => item.codec_type === 'video',
        );
        if (!stream?.width || !stream.height) {
          resolve({
            width: null,
            height: null,
            durationSec: data.format?.duration ?? null,
          });
          return;
        }

        const rotation = this.getRotation(stream);
        const isSideways = Math.abs(rotation) % 180 === 90;
        const width = isSideways ? stream.height : stream.width;
        const height = isSideways ? stream.width : stream.height;

        resolve({
          width,
          height,
          durationSec: data.format?.duration ?? null,
        });
      });
    });
  }

  private getRotation(stream: VideoProbeStream): number {
    const tagRotation = Number(stream.tags?.rotate ?? 0);
    if (Number.isFinite(tagRotation) && tagRotation !== 0) {
      return tagRotation;
    }

    const sideDataRotation = stream.side_data_list?.find(
      (item) => typeof item.rotation === 'number',
    )?.rotation;

    return sideDataRotation ?? 0;
  }

  private buildVariantPresets(
    source: VideoSourceMetadata,
  ): ResolvedQualityPreset[] {
    if (!source.width || !source.height) {
      return QUALITY_PRESETS.map((preset) => ({
        ...preset,
        ...this.resolveVariantSize(preset.maxLongSide, 16 / 9),
      }));
    }

    const sourceLongSide = Math.max(source.width, source.height);
    const aspectRatio = source.width / source.height;
    const usedSizes = new Set<string>();

    return QUALITY_PRESETS.map((preset) => {
      const targetLongSide = Math.min(preset.maxLongSide, sourceLongSide);
      const size = this.resolveVariantSize(targetLongSide, aspectRatio);

      return { ...preset, ...size };
    }).filter((preset) => {
      const key = `${preset.width}x${preset.height}`;
      if (usedSizes.has(key)) {
        return false;
      }
      usedSizes.add(key);
      return true;
    });
  }

  private resolveVariantSize(
    targetLongSide: number,
    aspectRatio: number,
  ): { width: number; height: number } {
    if (aspectRatio >= 1) {
      return {
        width: this.toEven(targetLongSide),
        height: this.toEven(targetLongSide / aspectRatio),
      };
    }

    return {
      width: this.toEven(targetLongSide * aspectRatio),
      height: this.toEven(targetLongSide),
    };
  }

  private toEven(value: number): number {
    return Math.max(2, Math.round(value / 2) * 2);
  }

  private async writeMasterPlaylist(
    masterPath: string,
    variants: TranscodeVariantResult[],
  ): Promise<void> {
    const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3', ''];

    for (const v of variants) {
      const bandwidth = v.bitrateKbps * 1000;
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${v.width}x${v.height},NAME="${v.label}"`,
        `${v.label}/index.m3u8`,
        '',
      );
    }

    await fs.promises.writeFile(masterPath, lines.join('\n'), 'utf-8');
  }
}
