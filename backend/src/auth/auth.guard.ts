import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtUser {
  sub: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'COLLECTOR' | 'REVIEWER' | 'FARMER';
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少登录令牌');
    }
    try {
      req.user = await this.jwt.verifyAsync<JwtUser>(header.slice(7), {
        secret: process.env.JWT_SECRET ?? 'local-dev-farm-film-secret',
      });
    } catch {
      throw new UnauthorizedException('登录令牌无效或已过期');
    }
    return true;
  }
}
