import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersDto } from '../dto/list-users.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../entities/user.entity';
import type { IUserRepository } from '../repositories/user.repository.interface';
import { USER_REPOSITORY } from '../repositories/user.repository.interface';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
  ) {}

  async findAll(
    query: ListUsersDto,
  ): Promise<{ users: User[]; total: number }> {
    return this.userRepo.findAll({ page: query.page, limit: query.limit });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(`Email ${dto.email} is already in use`);
    }
    const user = await this.userRepo.create(dto);
    this.logger.log(`Created user ${user.id}`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findById(id);

    if (dto.email) {
      const existing = await this.userRepo.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Email ${dto.email} is already in use`);
      }
    }

    const updated = await this.userRepo.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.userRepo.softDelete(id);
    this.logger.log(`Soft-deleted user ${id}`);
  }
}
