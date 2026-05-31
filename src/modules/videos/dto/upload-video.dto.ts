import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadVideoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
