import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, Permission } from '../entities';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
  ) {}

  async findByName(name: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { name },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(`Role ${name} not found`);
    }

    return role;
  }

  async createRole(name: string, description?: string): Promise<Role> {
    const role = this.roleRepository.create({ name, description });
    return this.roleRepository.save(role);
  }

  async assignPermissions(
    roleName: string,
    permissionNames: string[],
  ): Promise<Role> {
    const role = await this.findByName(roleName);
    const permissions = await this.permissionRepository.findByIds(
      permissionNames,
    );

    role.permissions = permissions;
    return this.roleRepository.save(role);
  }
}