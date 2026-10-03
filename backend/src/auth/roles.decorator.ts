import { SetMetadata } from '@nestjs/common';
export const Roles = (...roles: Array<'ADMIN' | 'COLLECTOR' | 'REVIEWER' | 'FARMER'>) =>
  SetMetadata('roles', roles);
