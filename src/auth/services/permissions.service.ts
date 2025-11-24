import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../entities';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
  ) {}

  async createPermission(
    name: string,
    resource: string,
    action: string,
    description?: string,
  ): Promise<Permission> {
    const permission = this.permissionRepository.create({
      name,
      resource,
      action,
      description,
    });

    return this.permissionRepository.save(permission);
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.find();
  }

  async findByResource(resource: string): Promise<Permission[]> {
    return this.permissionRepository.find({ where: { resource } });
  }
}