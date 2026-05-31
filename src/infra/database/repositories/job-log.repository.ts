import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobLog, JobStatus } from '../entities/job-log.entity';
import {
  CreateJobLogData,
  IJobLogRepository,
} from './job-log.repository.interface';

@Injectable()
export class JobLogRepository implements IJobLogRepository {
  constructor(
    @InjectRepository(JobLog)
    private readonly repo: Repository<JobLog>,
  ) {}

  async create(data: CreateJobLogData): Promise<JobLog> {
    const log = this.repo.create({
      videoId: data.videoId,
      queueJobId: data.queueJobId,
      type: data.type,
      attempt: data.attempt,
      startedAt: data.startedAt,
      status: JobStatus.ACTIVE,
      message: null,
      errorStack: null,
      finishedAt: null,
    });
    return this.repo.save(log);
  }

  async markCompleted(id: string, finishedAt: Date): Promise<void> {
    await this.repo.update(id, {
      status: JobStatus.COMPLETED,
      finishedAt,
    });
  }

  async markFailed(
    id: string,
    message: string,
    errorStack: string | null,
    finishedAt: Date,
  ): Promise<void> {
    await this.repo.update(id, {
      status: JobStatus.FAILED,
      message,
      errorStack,
      finishedAt,
    });
  }
}
