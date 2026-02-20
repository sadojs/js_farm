import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { TuyaProject } from './entities/tuya-project.entity';
import { CreateUserDto, UpdateUserDto, UpdateTuyaProjectDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(TuyaProject) private tuyaRepo: Repository<TuyaProject>,
  ) {}

  async findAll() {
    const users = await this.usersRepo.find({ order: { createdAt: 'DESC' } });
    const result: any[] = [];
    for (const user of users) {
      const tuya = await this.tuyaRepo.findOne({ where: { userId: user.id } });
      result.push({
        ...this.sanitize(user),
        tuyaProject: tuya
          ? {
              name: tuya.name,
              accessId: tuya.accessId,
              endpoint: tuya.endpoint,
              projectId: tuya.projectId,
              enabled: tuya.enabled,
            }
          : null,
      });
    }
    return result;
  }

  async findOne(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return this.sanitize(user);
  }

  async create(dto: CreateUserDto) {
    const exists = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('이미 등록된 이메일입니다.');

    const user = this.usersRepo.create({
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      name: dto.name,
      role: dto.role || 'user',
      address: dto.address,
    });
    const saved = await this.usersRepo.save(user);
    return this.sanitize(saved);
  }

  // 자기 정보 수정 (role, status 변경 불가)
  async updateSelf(id: string, dto: UpdateUserDto) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    if (dto.name) user.name = dto.name;
    if (dto.address !== undefined) user.address = dto.address;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 10);

    const saved = await this.usersRepo.save(user);
    return this.sanitize(saved);
  }

  // 관리자 전용 수정 (모든 필드 변경 가능)
  async update(id: string, dto: UpdateUserDto) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    if (dto.name) user.name = dto.name;
    if (dto.role) user.role = dto.role;
    if (dto.address !== undefined) user.address = dto.address;
    if (dto.status) user.status = dto.status;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 10);

    const saved = await this.usersRepo.save(user);
    return this.sanitize(saved);
  }

  async remove(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    await this.usersRepo.remove(user);
    return { message: '삭제되었습니다.' };
  }

  async updateTuyaProject(userId: string, dto: UpdateTuyaProjectDto) {
    let tuya = await this.tuyaRepo.findOne({ where: { userId } });
    if (tuya) {
      tuya.name = dto.name;
      tuya.accessId = dto.accessId;
      if (dto.accessSecret) tuya.accessSecretEncrypted = dto.accessSecret; // TODO: AES-256 암호화
      tuya.endpoint = dto.endpoint;
      if (dto.projectId !== undefined) tuya.projectId = dto.projectId;
      tuya.enabled = dto.enabled ?? true;
    } else {
      tuya = this.tuyaRepo.create({
        userId,
        name: dto.name,
        accessId: dto.accessId,
        accessSecretEncrypted: dto.accessSecret, // TODO: AES-256 암호화
        endpoint: dto.endpoint,
        projectId: dto.projectId,
        enabled: dto.enabled ?? true,
      });
    }
    return this.tuyaRepo.save(tuya);
  }

  private sanitize(user: User) {
    const { passwordHash, ...result } = user;
    return result;
  }
}
