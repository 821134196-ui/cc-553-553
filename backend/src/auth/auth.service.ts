import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload = {
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    };
    return {
      token: await this.jwt.signAsync(payload, {
        secret: process.env.JWT_SECRET ?? 'local-dev-farm-film-secret',
        expiresIn: '12h',
      }),
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
    };
  }
}
