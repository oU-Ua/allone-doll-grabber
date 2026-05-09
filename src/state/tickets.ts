import { load, save } from './storage';

export type TicketStatus = 'pending' | 'won' | 'lost';
export type ShippingStatus = 'address-needed' | 'address-saved' | 'shipping' | 'delivered';

export interface Ticket {
  id: string;
  category: string;
  acquiredAt: number;
  status: TicketStatus;
  prizeName?: string;
  shipping?: ShippingStatus;
  address?: string;
  trackingNo?: string;
}

const KEY = 'tickets';

const PRIZE_POOL: Record<string, string[]> = {
  '스타벅스 1만원권': ['스타벅스 e기프트 1만원', '스타벅스 e기프트 2만원'],
  '치킨 세트': ['BBQ 황금올리브 세트', 'BHC 뿌링클 세트', '교촌 허니콤보'],
  '편의점 5천원권': ['CU 모바일 상품권 5,000원', 'GS25 모바일 상품권 5,000원'],
  '커피 쿠폰': ['이디야 아이스아메리카노', '메가커피 아메리카노'],
  '영화 1매': ['CGV 일반관 1매', '롯데시네마 일반관 1매', '메가박스 일반관 1매'],
};

function read(): Ticket[] {
  return load<Ticket[]>(KEY, []);
}
function write(t: Ticket[]): void {
  save(KEY, t);
}
function uid(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const tickets = {
  list(): Ticket[] {
    return read().slice().sort((a, b) => b.acquiredAt - a.acquiredAt);
  },
  add(category: string): Ticket {
    const list = read();
    const t: Ticket = { id: uid(), category, acquiredAt: Date.now(), status: 'pending' };
    list.push(t);
    write(list);
    return t;
  },
  /** 응모 결과 즉시 확인 (mock — 30% 당첨) */
  reveal(id: string): Ticket | null {
    const list = read();
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const t = list[idx];
    if (t.status !== 'pending') return t;
    const win = Math.random() < 0.3;
    t.status = win ? 'won' : 'lost';
    if (win) {
      const pool = PRIZE_POOL[t.category] ?? [t.category];
      t.prizeName = pool[(Math.random() * pool.length) | 0];
      t.shipping = 'address-needed';
    }
    list[idx] = t;
    write(list);
    return t;
  },
  saveAddress(id: string, address: string): Ticket | null {
    const list = read();
    const t = list.find((x) => x.id === id);
    if (!t || t.status !== 'won') return null;
    t.address = address;
    t.shipping = 'shipping';
    t.trackingNo = `KR${(Math.random() * 1e10 | 0).toString().padStart(10, '0')}`;
    write(list);
    return t;
  },
  /** 전부 + 비인증 보류분(임시 저장) 카운트 */
  pendingCount(): number {
    return read().filter((t) => t.status === 'pending').length;
  },
};
