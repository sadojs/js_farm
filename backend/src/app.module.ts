import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DevicesModule } from './modules/devices/devices.module';
import { GroupsModule } from './modules/groups/groups.module';
import { SensorsModule } from './modules/sensors/sensors.module';
import { AutomationModule } from './modules/automation/automation.module';
import { ReportsModule } from './modules/reports/reports.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { TuyaModule } from './modules/integrations/tuya/tuya.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { WeatherModule } from './modules/weather/weather.module';
import { SensorAlertsModule } from './modules/sensor-alerts/sensor-alerts.module';
import { EnvConfigModule } from './modules/env-config/env-config.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { VoiceModule } from './modules/voice/voice.module';
import { CropManagementModule } from './modules/crop-management/crop-management.module';
import { RetentionService } from './common/retention.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false, // 스키마는 schema.sql로 관리
      }),
    }),
    AuthModule,
    UsersModule,
    DevicesModule,
    GroupsModule,
    SensorsModule,
    AutomationModule,
    ReportsModule,
    GatewayModule,
    TuyaModule,
    DashboardModule,
    WeatherModule,
    SensorAlertsModule,
    EnvConfigModule,
    NotificationsModule,
    ActivityLogModule,
    VoiceModule,
    CropManagementModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    RetentionService,
  ],
})
export class AppModule {}
