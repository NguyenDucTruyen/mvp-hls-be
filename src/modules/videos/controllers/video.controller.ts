import {
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideoService } from '../services/video.service';
import { UploadVideoDto } from '../dto/upload-video.dto';
import { ListVideosDto } from '../dto/list-videos.dto';
import {
  VideoResponseDto,
  VideoVariantResponseDto,
} from '../dto/video-response.dto';
import { Video } from '../entities/video.entity';
import {
  createApiResponse,
  createApiListResponse,
} from '@/shared/utils/api-response.util';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

@Controller('videos')
export class VideoController {
  private readonly logger = new Logger(VideoController.name);

  constructor(private readonly videoService: VideoService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({
            fileType: /video\/(mp4|quicktime|x-msvideo|webm|x-matroska)/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadVideoDto,
  ): Promise<{ data: { id: string; status: string } }> {
    this.logger.log(
      `Upload request: filename=${file.originalname}, size=${file.size}, title=${dto.title}`,
    );
    try {
      const video = await this.videoService.uploadVideo(file, dto);
      this.logger.log(
        `Upload success: videoId=${video.id}, status=${video.status}`,
      );
      return createApiResponse({ id: video.id, status: video.status });
    } catch (err) {
      this.logger.error(
        `Upload failed: filename=${file.originalname}`,
        serializeError(err),
      );
      throw err;
    }
  }

  @Get()
  async findAll(@Query() query: ListVideosDto): Promise<{
    data: VideoResponseDto[];
    meta: { total: number; page: number; limit: number };
  }> {
    this.logger.log(
      `List videos request: page=${query.page ?? 1}, limit=${query.limit ?? 20}, status=${query.status ?? 'all'}`,
    );
    try {
      const { videos, total } = await this.videoService.findAll(query);
      this.logger.log(
        `List videos success: returned=${videos.length}, total=${total}`,
      );
      return createApiListResponse(videos.map(toResponseDto), {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      });
    } catch (err) {
      this.logger.error('List videos failed', serializeError(err));
      throw err;
    }
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: VideoResponseDto }> {
    this.logger.log(`Get video request: id=${id}`);
    try {
      const video = await this.videoService.findById(id);
      this.logger.log(`Get video success: id=${id}, status=${video.status}`);
      return createApiResponse(toResponseDto(video));
    } catch (err) {
      this.logger.error(`Get video failed: id=${id}`, serializeError(err));
      throw err;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    this.logger.log(`Delete video request: id=${id}`);
    try {
      await this.videoService.deleteVideo(id);
      this.logger.log(`Delete video success: id=${id}`);
    } catch (err) {
      this.logger.error(`Delete video failed: id=${id}`, serializeError(err));
      throw err;
    }
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: { id: string; status: string } }> {
    this.logger.log(`Retry video request: id=${id}`);
    try {
      const video = await this.videoService.retryVideo(id);
      this.logger.log(`Retry video success: id=${id}, status=${video.status}`);
      return createApiResponse({ id: video.id, status: video.status });
    } catch (err) {
      this.logger.error(`Retry video failed: id=${id}`, serializeError(err));
      throw err;
    }
  }
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
  } catch {
    return String(err);
  }
}

function toResponseDto(video: Video): VideoResponseDto {
  const dto = new VideoResponseDto();
  dto.id = video.id;
  dto.title = video.title;
  dto.description = video.description;
  dto.status = video.status;
  dto.progress = video.progress;
  dto.playbackUrl = video.playbackUrl;
  dto.thumbnailUrl = video.thumbnailUrl;
  dto.durationSec = video.durationSec;
  dto.width = video.width;
  dto.height = video.height;
  dto.errorMessage = video.errorMessage;
  dto.createdAt = video.createdAt;
  dto.updatedAt = video.updatedAt;
  dto.variants = (video.variants ?? []).map((v) => {
    const vDto = new VideoVariantResponseDto();
    vDto.id = v.id;
    vDto.qualityLabel = v.qualityLabel;
    vDto.width = v.width;
    vDto.height = v.height;
    vDto.bitrateKbps = v.bitrateKbps;
    vDto.playlistUrl = v.playlistUrl;
    return vDto;
  });
  return dto;
}
