import { ToolsState, ToolInfo } from '../types/index.js';
import { ALL_TOOLS } from './toolConfig.js';

// ============================================================
// Permissions Manager
// Controls access to tools based on configuration
// ============================================================

export interface PermissionProfile {
  name: string;
  description: string;
  toolsState: ToolsState;
}

// Predefined permission profiles
export const PERMISSION_PROFILES: PermissionProfile[] = [
  {
    name: 'Somente Leitura',
    description: 'Apenas consultas e leitura de esquema — sem modificações',
    toolsState: buildProfileState(tool => !tool.isDestructive && !tool.isAdvanced)
  },
  {
    name: 'Desenvolvedor',
    description: 'Acesso completo às ferramentas básicas de modelagem',
    toolsState: buildProfileState(tool => !tool.isAdvanced)
  },
  {
    name: 'Avançado',
    description: 'Acesso completo incluindo ferramentas avançadas',
    toolsState: buildProfileState(() => true)
  },
  {
    name: 'Apenas DAX',
    description: 'Somente operações relacionadas a DAX',
    toolsState: buildProfileState(tool =>
      ['get_semantic_model_schema', 'generate_query', 'execute_query', 'dax_query_operations', 'measure_operations'].includes(tool.id)
    )
  }
];

function buildProfileState(predicate: (tool: ToolInfo) => boolean): ToolsState {
  const state: ToolsState = {};
  for (const tool of ALL_TOOLS) {
    state[tool.id] = predicate(tool);
  }
  return state;
}

// Validate that a tool operation is allowed given the current state
export function isToolAllowed(toolId: string, toolsState: ToolsState): boolean {
  return toolsState[toolId] === true;
}

// Get a summary of current permissions
export interface PermissionsSummary {
  enabledCount: number;
  totalCount: number;
  destructiveEnabled: string[];
  advancedEnabled: string[];
  readOnlyMode: boolean;
}

export function getPermissionsSummary(toolsState: ToolsState, readOnly: boolean): PermissionsSummary {
  const enabledTools = ALL_TOOLS.filter(t => toolsState[t.id]);
  return {
    enabledCount: enabledTools.length,
    totalCount: ALL_TOOLS.length,
    destructiveEnabled: enabledTools.filter(t => t.isDestructive).map(t => t.name),
    advancedEnabled: enabledTools.filter(t => t.isAdvanced).map(t => t.name),
    readOnlyMode: readOnly
  };
}

// Apply a permission profile
export function applyProfile(profile: PermissionProfile): ToolsState {
  return { ...profile.toolsState };
}
