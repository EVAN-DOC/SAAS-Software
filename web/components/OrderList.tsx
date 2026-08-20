import { Order } from "@/lib/types";
import OrderCard from "./OrderCard";

interface Props {
  orders: Order[];
  visibleCount: number;
  totalCount: number;
  onLoadMore: () => void;
}

export default function OrderList({ orders, visibleCount, totalCount, onLoadMore }: Props) {
  const remaining = totalCount - visibleCount;
  const done = visibleCount >= totalCount;

  return (
    <>
      <div className="order-list">
        {orders.length === 0 ? (
          <div className="state-msg">No orders match this filter.</div>
        ) : (
          orders.map((o) => <OrderCard order={o} key={o.id} />)
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button className="load-more-btn" onClick={onLoadMore} disabled={done}>
          {done ? "All orders loaded" : `Load 25 more (${remaining} remaining)`}
        </button>
      </div>
    </>
  );
}
