// src/components/BybitDashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import crypto from "crypto";

const API_KEY = import.meta.env.VITE_API_KEY;
const API_SECRET = import.meta.env.VITE_API_SECRET;
const WS_URL = import.meta.env.VITE_WS_URL;

export default function BybitDashboard() {
  const [openOrders, setOpenOrders] = useState([]);
  const [closeOrders, setCloseOrders] = useState([]);
  const [completedTrades, setCompletedTrades] = useState([]);
  const [tradeStats, setTradeStats] = useState({
    totalTrades: 0,
    totalPNL: 0,
    winRate: 0,
    lossRate: 0,
    avgWin: 0,
    avgLoss: 0,
  });

  const wsRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  function connectWebSocket() {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Connected to Bybit WebSocket");
      authenticate(ws);
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.topic === "order") handleOrderUpdate(data.data);
    };

    ws.onclose = () => {
      console.log("WebSocket closed. Reconnecting...");
      setTimeout(connectWebSocket, 3000);
    };
  }

  function authenticate(ws) {
    const expires = Date.now() + 5000;
    const signature = crypto
      .createHmac("sha256", API_SECRET)
      .update(`api_key=${API_KEY}&expires=${expires}`)
      .digest("hex");

    ws.send(
      JSON.stringify({ op: "auth", args: [API_KEY, expires, signature] })
    );

    ws.send(JSON.stringify({ op: "subscribe", args: ["order"] }));
  }

  function handleOrderUpdate(order) {
    if (!order || !order.order_status) return;

    if (order.order_status === "New" || order.order_status === "PartiallyFilled") {
      setOpenOrders((prev) => [...prev.filter(o => o.order_id !== order.order_id), order]);
    } else if (order.order_status === "Filled") {
      setCloseOrders((prev) => [...prev.filter(o => o.order_id !== order.order_id), order]);
      finalizeTrade(order);
    }
  }

  function finalizeTrade(order) {
    setCompletedTrades((prev) => [...prev, order]);
    setOpenOrders([]);
    setCloseOrders([]);
    updateTradeStats(order);
  }

  function updateTradeStats(order) {
    setTradeStats((prev) => {
      const totalTrades = prev.totalTrades + 1;
      const totalPNL = prev.totalPNL + order.cum_exec_value || 0; // Use cum_exec_value as PNL example
      const wins = prev.winRate * prev.totalTrades + (order.cum_exec_value > 0 ? 1 : 0);
      const losses = totalTrades - wins;

      return {
        totalTrades,
        totalPNL,
        winRate: (wins / totalTrades) * 100,
        lossRate: (losses / totalTrades) * 100,
        avgWin:
          order.cum_exec_value > 0
            ? ((prev.avgWin * (wins - 1 || 1) + order.cum_exec_value) / wins)
            : prev.avgWin,
        avgLoss:
          order.cum_exec_value < 0
            ? ((prev.avgLoss * (losses - 1 || 1) + order.cum_exec_value) / losses)
            : prev.avgLoss,
      };
    });
  }

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Open Orders */}
      <div className="bg-gray-100 p-4 rounded shadow">
        <h2 className="font-bold mb-2">Open Orders</h2>
        {openOrders.length === 0 ? (
          <p className="text-gray-500">No open orders</p>
        ) : (
          openOrders.map((o) => (
            <div key={o.order_id} className="border-b py-1">
              {o.symbol} - {o.qty} @ {o.price} ({o.order_status})
            </div>
          ))
        )}
      </div>

      {/* Close Orders */}
      <div className="bg-gray-100 p-4 rounded shadow">
        <h2 className="font-bold mb-2">Close Orders</h2>
        {closeOrders.length === 0 ? (
          <p className="text-gray-500">No close orders</p>
        ) : (
          closeOrders.map((o) => (
            <div key={o.order_id} className="border-b py-1">
              {o.symbol} - {o.qty} @ {o.price} ({o.order_status})
            </div>
          ))
        )}
      </div>

      {/* Completed Trades */}
      <div className="bg-gray-100 p-4 rounded shadow">
        <h2 className="font-bold mb-2">Completed Trades</h2>
        {completedTrades.length === 0 ? (
          <p className="text-gray-500">No completed trades</p>
        ) : (
          completedTrades.map((o) => (
            <div key={o.order_id} className="border-b py-1">
              {o.symbol} - PNL: {o.cum_exec_value || 0}
            </div>
          ))
        )}
        <div className="mt-4 text-sm">
          <p>Total Trades: {tradeStats.totalTrades}</p>
          <p>Total PNL: {tradeStats.totalPNL.toFixed(2)}</p>
          <p>Win %: {tradeStats.winRate.toFixed(2)}</p>
          <p>Loss %: {tradeStats.lossRate.toFixed(2)}</p>
          <p>Avg Win: {tradeStats.avgWin.toFixed(2)}</p>
          <p>Avg Loss: {tradeStats.avgLoss.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
