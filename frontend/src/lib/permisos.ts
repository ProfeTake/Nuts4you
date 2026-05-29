/**
 * Matriz de permisos por rol.
 * Define qué módulos y acciones puede realizar cada rol.
 */
import type { RolUsuario } from '@/tipos/pos.tipos'

type Modulo = 'pos' | 'inventario' | 'bodega' | 'finanzas' | 'rrhh' | 'usuarios' | 'admin'
type Accion = 'ver' | 'crear' | 'editar' | 'eliminar'

const matrizPermisos: Record<RolUsuario, Partial<Record<Modulo, Accion[]>>> = {
  ADMIN: {
    pos: ['ver', 'crear', 'editar', 'eliminar'],
    inventario: ['ver', 'crear', 'editar', 'eliminar'],
    bodega: ['ver', 'crear', 'editar', 'eliminar'],
    finanzas: ['ver', 'crear', 'editar', 'eliminar'],
    rrhh: ['ver', 'crear', 'editar', 'eliminar'],
    usuarios: ['ver', 'crear', 'editar', 'eliminar'],
    admin: ['ver', 'crear', 'editar', 'eliminar'],
  },
  SUPERVISOR: {
    pos: ['ver'],
    inventario: ['ver', 'crear', 'editar'],
    bodega: ['ver'],
    finanzas: ['ver', 'crear', 'editar'],
    rrhh: ['ver', 'crear', 'editar'],
    admin: ['ver'],
  },
  BODEGUERO: {
    inventario: ['ver', 'crear', 'editar'],
    bodega: ['ver', 'crear', 'editar'],
  },
  VENDEDOR: {
    pos: ['ver', 'crear'],
    inventario: ['ver'],
  },
}

/** Verifica si un rol tiene permiso para una acción en un módulo */
export function tienePermiso(rol: RolUsuario, modulo: Modulo, accion: Accion): boolean {
  const acciones = matrizPermisos[rol]?.[modulo]
  return acciones?.includes(accion) ?? false
}

/** Retorna todos los módulos accesibles para un rol */
export function modulosAccesibles(rol: RolUsuario): Modulo[] {
  return Object.keys(matrizPermisos[rol] ?? {}) as Modulo[]
}
