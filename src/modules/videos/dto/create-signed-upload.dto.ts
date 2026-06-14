import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_DIRECT_UPLOAD_SIZE = 500 * 1024 * 1024;

export class CreateSignedUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originalFilename!: string;

  @IsString()
  @IsIn([
    '',
    'application/octet-stream',
    'video/mp4',
    'video/quicktime',
    'video/x-m4v',
    'video/3gpp',
    'video/3gpp2',
    'video/x-msvideo',
    'video/msvideo',
    'video/avi',
    'video/webm',
    'video/x-matroska',
  ])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DIRECT_UPLOAD_SIZE)
  sizeBytes!: number;
}

export { MAX_DIRECT_UPLOAD_SIZE };
