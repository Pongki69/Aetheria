import Phaser from 'phaser';
import EasyStar from 'easystarjs';
import { useAgentStore } from '../store/useAgentStore';
import type { AgentStatus } from '../store/useAgentStore';

const TILE_SIZE = 32;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;

export class OfficeScene extends Phaser.Scene {
  private easystar: EasyStar.js;
  private agentSprites: Map<string, Phaser.GameObjects.Container> = new Map();

  constructor() {
    super('OfficeScene');
    this.easystar = new EasyStar.js();
  }

  create() {
    // 1. Draw grid office floor
    const graphics = this.add.graphics();
    for (let x = 0; x < GRID_WIDTH; x++) {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        const isEven = (x + y) % 2 === 0;
        graphics.fillStyle(isEven ? 0x1e293b : 0x334155, 1);
        graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // 2. Simple obstacle map (0 = walkable, 1 = desk/wall)
    const grid: number[][] = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const row: number[] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        // Place some dummy desks
        const isDesk = (x === 6 && y > 2 && y < 8) || (x === 14 && y > 2 && y < 8);
        if (isDesk) {
          graphics.fillStyle(0x0f172a, 1);
          graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
        row.push(isDesk ? 1 : 0);
      }
      grid.push(row);
    }

    // 3. Configure EasyStar pathfinding
    this.easystar.setGrid(grid);
    this.easystar.setAcceptableTiles([0]);

    // 4. Render agents from Zustand state
    const agents = useAgentStore.getState().agents;
    agents.forEach((agent) => this.spawnAgent(agent));

    // 5. Handle canvas clicks for pathfinding / selection
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const targetX = Math.floor(pointer.x / TILE_SIZE);
      const targetY = Math.floor(pointer.y / TILE_SIZE);
      const selectedId = useAgentStore.getState().selectedAgentId;

      if (selectedId && targetX < GRID_WIDTH && targetY < GRID_HEIGHT) {
        this.moveAgentTo(selectedId, targetX, targetY);
      }
    });
  }

  private spawnAgent(agent: any) {
    const container = this.add.container(
      agent.gridX * TILE_SIZE + TILE_SIZE / 2,
      agent.gridY * TILE_SIZE + TILE_SIZE / 2
    );

    // Agent body circle
    const avatar = this.add.circle(0, 0, 12, 0x3b82f6);
    
    // Status indicator badge
    const statusBadge = this.add.circle(8, -8, 4, this.getStatusColor(agent.status));

    container.add([avatar, statusBadge]);
    container.setSize(24, 24);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation(); // Don't trigger floor click
      useAgentStore.getState().selectAgent(agent.id);
    });

    this.agentSprites.set(agent.id, container);
  }

  public moveAgentTo(id: string, targetX: number, targetY: number) {
    const agent = useAgentStore.getState().agents.find((a) => a.id === id);
    if (!agent) return;

    this.easystar.findPath(agent.gridX, agent.gridY, targetX, targetY, (path) => {
      if (!path || path.length === 0) return;

      const container = this.agentSprites.get(id);
      if (!container) return;

      // Animate walking along the path
      const tweens: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
      path.forEach((point, index) => {
        if (index === 0) return;
        tweens.push({
          targets: container,
          x: point.x * TILE_SIZE + TILE_SIZE / 2,
          y: point.y * TILE_SIZE + TILE_SIZE / 2,
          duration: 200,
        });
      });

      this.tweens.chain({ tweens });
      useAgentStore.getState().moveAgent(id, targetX, targetY);
    });

    this.easystar.calculate();
  }

  private getStatusColor(status: AgentStatus): number {
    switch (status) {
      case 'working': return 0x22c55e;
      case 'thinking': return 0xeab308;
      case 'error': return 0xef4444;
      default: return 0x94a3b8;
    }
  }
}