import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'house_id', nullable: true })
  houseId: string;

  @Column({ name: 'tuya_device_id' })
  tuyaDeviceId: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ name: 'device_type' })
  deviceType: 'sensor' | 'actuator';

  @Column({ name: 'equipment_type', nullable: true })
  equipmentType: 'opener' | 'fan' | 'irrigation' | 'other';

  @Column({ nullable: true })
  icon: string;

  @Column({ default: false })
  online: boolean;

  @Column({ name: 'last_seen', nullable: true })
  lastSeen: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
