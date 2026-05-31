import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersDto } from '../dto/list-users.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../entities/user.entity';
import { UserService } from '../services/user.service';
import {
  createApiResponse,
  createApiListResponse,
} from '@/shared/utils/api-response.util';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async findAll(@Query() query: ListUsersDto): Promise<{
    data: User[];
    meta: { total: number; page: number; limit: number };
  }> {
    const { users, total } = await this.userService.findAll(query);
    return createApiListResponse(users, {
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: User }> {
    const user = await this.userService.findById(id);
    return createApiResponse(user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto): Promise<{ data: User }> {
    const user = await this.userService.create(dto);
    return createApiResponse(user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<{ data: User }> {
    const user = await this.userService.update(id, dto);
    return createApiResponse(user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.userService.remove(id);
  }
}
