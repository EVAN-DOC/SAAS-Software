import { Order } from "@/lib/types";
import OrderCard from "./OrderCard";
import Pagination from "./Pagination";

interface Props {
  orders: Order[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function OrderList({ orders, page, totalPages, onPageChange }: Props) {
  return (
    <>
      <div className="order-list">
        {orders.length === 0 ? (
          <div className="state-msg">No orders match this filter.</div>
        ) : (
          orders.map((o) => <OrderCard order={o} key={o.id} />)
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
    </>
  );
}
