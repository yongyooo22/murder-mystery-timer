export interface Stage {
  id: string;
  name: string;
  durationSec: number;
}

export interface Scenario {
  id: string;
  name: string;
  stages: Stage[];
  createdAt: string;
  updatedAt: string;
  /** 저장할 때마다 1씩 오르는 버전. 동시에 수정했는지 확인하는 데 쓴다. */
  rev: number;
  deletedAt: string | null;
}

export interface ScenarioInput {
  name: string;
  stages: Stage[];
}
