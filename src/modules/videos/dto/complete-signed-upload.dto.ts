import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class CompleteSignedUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  publicId!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  signature!: string;

  @IsUrl({ require_protocol: true })
  secureUrl!: string;
}
