import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Ffmpeg = require('fluent-ffmpeg') as typeof import('fluent-ffmpeg');

Ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface QualityPreset {
  label: string;
  width: number;
  height: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

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
}

const QUALITY_PRESETS: QualityPreset[] = [
  {
    label: '360p',
    width: 640,
    height: 360,
    videoBitrateKbps: 800,
    audioBitrateKbps: 96,
  },
  {
    label: '720p',
    width: 1280,
    height: 720,
    videoBitrateKbps: 2800,
    audioBitrateKbps: 128,
  },
  {
    label: '1080p',
    width: 1920,
    height: 1080,
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

    const variants: TranscodeVariantResult[] = [];

    for (const preset of QUALITY_PRESETS) {
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
    return { masterPlaylistPath, variants };
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
          size: '1280x720',
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
    preset: QualityPreset,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(preset.videoBitrateKbps)
        .audioBitrate(preset.audioBitrateKbps)
        .size(`${preset.width}x${preset.height}`)
        .outputOptions([
          '-preset veryfast',
          '-profile:v baseline',
          '-level 3.0',
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
