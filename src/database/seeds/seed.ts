import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { RolesService } from '../../auth/services/roles.service';
import { PermissionsService } from '../../auth/services/permissions.service';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const rolesService = app.get(RolesService);
  const permissionsService = app.get(PermissionsService);

  // Create permissions
  const permissions = [
    { name: 'orders:read', resource: 'orders', action: 'read' },
    { name: 'orders:write', resource: 'orders', action: 'write' },
    { name: 'orders:delete', resource: 'orders', action: 'delete' },
    { name: 'users:read', resource: 'users', action: 'read' },
    { name: 'users:write', resource: 'users', action: 'write' },
    { name: 'users:delete', resource: 'users', action: 'delete' },
  ];

  for (const perm of permissions) {
    try {
      await permissionsService.createPermission(
        perm.name,
        perm.resource,
        perm.action,
      );
      console.log(`✓ Created permission: ${perm.name}`);
    } catch (error) {
      console.log(`Permission ${perm.name} already exists`);
    }
  }

  // Create roles
  const roles = [
    { name: 'user', description: 'Standard user role' },
    { name: 'moderator', description: 'Moderator role' },
    { name: 'admin', description: 'Administrator role' },
  ];

  for (const role of roles) {
    try {
      await rolesService.createRole(role.name, role.description);
      console.log(`✓ Created role: ${role.name}`);
    } catch (error) {
      console.log(`Role ${role.name} already exists`);
    }
  }

  // Assign permissions to roles
  await rolesService.assignPermissions('user', [
    'orders:read',
    'orders:write',
  ]);
  await rolesService.assignPermissions('moderator', [
    'orders:read',
    'orders:write',
    'users:read',
  ]);
  await rolesService.assignPermissions('admin', [
    'orders:read',
    'orders:write',
    'orders:delete',
    'users:read',
    'users:write',
    'users:delete',
  ]);

  console.log('✅ Seed completed successfully');
  await app.close();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});