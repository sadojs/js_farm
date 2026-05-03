import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Device } from '../../devices/entities/device.entity';
import { TuyaProject } from '../../users/entities/tuya-project.entity';

export interface TuyaCredentials {
  accessId: string;
  accessSecret: string;
  endpoint: string;
}

export async function resolveCredentials(
  device: Pick<Device, 'tuyaProjectId' | 'userId'>,
  tuyaProjectRepo: Repository<TuyaProject>,
  decryptSecret: (encrypted: string) => string,
): Promise<TuyaCredentials> {
  let project: TuyaProject | null = null;

  if (device.tuyaProjectId) {
    project = await tuyaProjectRepo.findOne({ where: { id: device.tuyaProjectId } });
  }
  if (!project) {
    project = await tuyaProjectRepo.findOne({
      where: { userId: device.userId },
      order: { createdAt: 'ASC' },
    });
  }
  if (!project) throw new NotFoundException('Tuya 프로젝트 설정이 없습니다.');

  return {
    accessId: project.accessId,
    accessSecret: decryptSecret(project.accessSecretEncrypted),
    endpoint: project.endpoint,
  };
}
