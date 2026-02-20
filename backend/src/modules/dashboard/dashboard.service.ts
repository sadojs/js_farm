import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../users/entities/user.entity';

interface PositionEntry {
  code: string;
  level1: string;
  level2: string;
  level3: string;
  nx: number;
  ny: number;
  longitude: number;
  latitude: number;
  updatedAt: string;
}

interface KmaItem {
  category: string;
  obsrValue: string;
}

@Injectable()
export class DashboardService {
  private readonly positions: PositionEntry[];

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {
    const filePath = path.join(process.cwd(), 'src/modules/dashboard/position.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    this.positions = JSON.parse(raw) as PositionEntry[];
  }

  async getWeatherForUser(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    if (!user.address) {
      throw new NotFoundException('사용자 주소가 설정되지 않았습니다.');
    }

    const position = this.findBestPosition(user.address);
    if (!position) {
      throw new NotFoundException(`주소에 대응하는 좌표를 찾지 못했습니다: ${user.address}`);
    }

    const serviceKey = this.getServiceKey();
    const { baseDate, baseTime } = this.getUltraSrtNcstBaseDateTime(new Date());

    const { data } = await axios.get('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst', {
      params: {
        serviceKey,
        pageNo: 1,
        numOfRows: 100,
        dataType: 'JSON',
        base_date: baseDate,
        base_time: baseTime,
        nx: position.nx,
        ny: position.ny,
      },
      timeout: 10000,
    });

    const header = data?.response?.header;
    if (header?.resultCode !== '00') {
      throw new ServiceUnavailableException(`기상청 API 오류: ${header?.resultMsg || 'unknown error'}`);
    }

    const items = (data?.response?.body?.items?.item || []) as KmaItem[];
    const parsed = this.parseNcstItems(items);

    return {
      location: {
        address: user.address,
        level1: position.level1,
        level2: position.level2,
        level3: position.level3,
        nx: position.nx,
        ny: position.ny,
        longitude: position.longitude,
        latitude: position.latitude,
      },
      weather: {
        temperature: parsed.temperature,
        humidity: parsed.humidity,
        precipitation: parsed.precipitation,
        windSpeed: parsed.windSpeed,
        condition: parsed.condition,
      },
      fetchedAt: new Date().toISOString(),
      source: {
        baseDate,
        baseTime,
        endpoint: 'getUltraSrtNcst',
      },
    };
  }

  private getServiceKey(): string {
    const encodedFallback =
      'Ovj%2FY%2Bkq2KuEXQDUmEBRg4ekq4bR2xjBSmwLU0Atp4r2ZJeOKhMBjap2M5J34fLoj5VM9w6VA%2FySVbjAtgX9SQ%3D%3D';
    const configured = process.env.KMA_SERVICE_KEY || process.env.KMA_API_KEY || encodedFallback;

    // API 키가 URL 인코딩된 형태로 주어지므로 디코드 후 axios가 다시 1회 인코딩하도록 처리
    try {
      return configured.includes('%') ? decodeURIComponent(configured) : configured;
    } catch {
      return configured;
    }
  }

  private findBestPosition(address: string): PositionEntry | null {
    const normalizedAddress = this.normalize(address);

    let best: PositionEntry | null = null;
    let bestScore = -1;

    for (const entry of this.positions) {
      const l1 = this.normalize(entry.level1);
      const l2 = this.normalize(entry.level2);
      const l3 = this.normalize(entry.level3);

      let score = 0;
      if (l1 && normalizedAddress.includes(l1)) score += 10;
      if (l2 && normalizedAddress.includes(l2)) score += 30;
      if (l3 && normalizedAddress.includes(l3)) score += 60;

      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }

    return bestScore > 0 ? best : null;
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, '').replace(/[().,-]/g, '');
  }

  private getUltraSrtNcstBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
    const local = new Date(now);

    // 초단기실황은 정시 기준으로 생성되므로 안전하게 45분 이전에는 이전 시각을 사용
    if (local.getMinutes() < 45) {
      local.setHours(local.getHours() - 1);
    }

    const yyyy = local.getFullYear();
    const mm = String(local.getMonth() + 1).padStart(2, '0');
    const dd = String(local.getDate()).padStart(2, '0');
    const hh = String(local.getHours()).padStart(2, '0');

    return {
      baseDate: `${yyyy}${mm}${dd}`,
      baseTime: `${hh}00`,
    };
  }

  private parseNcstItems(items: KmaItem[]) {
    const map = new Map(items.map((item) => [item.category, Number(item.obsrValue)]));

    const temperature = map.get('T1H') ?? null;
    const humidity = map.get('REH') ?? null;
    const precipitation = map.get('RN1') ?? 0;
    const windSpeed = map.get('WSD') ?? null;

    let condition = 'clear';
    if ((precipitation ?? 0) > 0) {
      condition = 'rain';
    }

    return { temperature, humidity, precipitation, windSpeed, condition };
  }
}
