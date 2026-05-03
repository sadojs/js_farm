import { IsString, MinLength, Matches, IsOptional, IsIn, IsBoolean } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{2,49}$/, { message: '아이디는 영문 소문자로 시작하며 3~50자여야 합니다.' })
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsIn(['admin', 'farm_admin', 'farm_user'])
  role?: 'admin' | 'farm_admin' | 'farm_user';

  @IsOptional()
  @IsString()
  parentUserId?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['admin', 'farm_admin', 'farm_user'])
  role?: 'admin' | 'farm_admin' | 'farm_user';

  @IsOptional()
  @IsString()
  parentUserId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

export class CreateTuyaProjectDto {
  @IsString()
  label: string;

  @IsString()
  name: string;

  @IsString()
  accessId: string;

  @IsString()
  accessSecret: string;

  @IsString()
  endpoint: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

export class UpdateTuyaProjectDto {
  @IsString()
  name: string;

  @IsString()
  accessId: string;

  @IsOptional()
  @IsString()
  accessSecret?: string;

  @IsString()
  endpoint: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
