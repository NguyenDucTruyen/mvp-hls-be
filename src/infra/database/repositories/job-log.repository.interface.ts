import { JobType } from '../../queue/queue.constants';
import { JobLog, JobStatus } from '../entities/job-log.entity';

export const JOB_LOG_REPOSITORY = 'JOB_LOG_REPOSITORY';

export interface CreateJobLogData {
  videoId: string;
  queueJobId: string | null;
  type: JobType;
  attempt: number;
  startedAt: Date;
}

export interface IJobLogRepository {
  create(data: CreateJobLogData): Promise<JobLog>;
  markCompleted(id: string, finishedAt: Date): Promise<void>;
  markFailed(
    id: string,
    message: string,
    errorStack: string | null,
    finishedAt: Date,
  ): Promise<void>;
}

export { JobLog, JobStatus };
