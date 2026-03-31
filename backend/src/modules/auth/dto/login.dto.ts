import { IsString, MinLength, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{2,49}$/, { message: '아이디는 영문 소문자로 시작하며 3~50자여야 합니다.' })
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
