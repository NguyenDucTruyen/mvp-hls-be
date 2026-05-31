export const VIDEO_QUEUE = 'video-processing';

export const JobType = {
  TRANSCODE_HLS: 'transcode-hls',
  GENERATE_THUMBNAIL: 'generate-thumbnail',
  CLEANUP_TEMP: 'cleanup-temp',
} as const;

export type JobType = (typeof JobType)[keyof typeof JobType];
