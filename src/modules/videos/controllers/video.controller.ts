import {
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
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
    const video = await this.videoService.uploadVideo(file, dto);
    return createApiResponse({ id: video.id, status: video.status });
  }

  @Get()
  async findAll(@Query() query: ListVideosDto): Promise<{
    data: VideoResponseDto[];
    meta: { total: number; page: number; limit: number };
  }> {
    const { videos, total } = await this.videoService.findAll(query);
    return createApiListResponse(videos.map(toResponseDto), {
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: VideoResponseDto }> {
    const video = await this.videoService.findById(id);
    return createApiResponse(toResponseDto(video));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.videoService.deleteVideo(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: { id: string; status: string } }> {
    const video = await this.videoService.retryVideo(id);
    return createApiResponse({ id: video.id, status: video.status });
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
