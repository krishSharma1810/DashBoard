import React from 'react'
import { useEffect, useState } from "react";
import axios from "axios";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";



const LivePositionsREST = () => {
    const [position, setPosition] = useState({});
    const [history, setHistory] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
        try {
            const res = await axios.get("http://localhost:4000/api/position");
            setPosition(res.data);
            

            // Save markPrice history for chart
            if (res.data && res.data.markPrice) {
            setHistory((prev) => [
                ...prev.slice(-30), // keep only last 30 points
                { time: res.data.timestamp, markPrice: parseFloat(res.data.markPrice) },
            ]);
            }
        } catch (err) {
            console.error("❌ API error:", err);
        }
        };

        // fetch immediately on load
        fetchData();

        // fetch every 1 second
        const interval = setInterval(fetchData, 500);

        return () => clearInterval(interval);
    }, []);

  return (
    <div className="bg-grey">
      {/* Position Info */}
      <div className="p-4 ml-16 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">Current Position</h2>
        {position && position.symbol ? (
          <ul className="space-y-1">
            <li><b>Symbol:</b> {position.symbol}</li>
            <li><b>Side:</b> {position.side}</li>
            <li><b>Size:</b> {position.size}</li>
            <li><b>Entry Price:</b> {position.entryPrice}</li>
            <li><b>Mark Price:</b> {position.markPrice}</li>
            <li><b>Initial Margin:</b> {position.initialMargin}</li>
            <li><b>Unrealized PnL:</b> {position.unrealisedPnl}</li>
            <li><b>Realized PnL:</b> {position.curRealisedPnl}</li>
            <li><b>Leverage:</b> {position.leverage}</li>
            <li><b>Last Update:</b> {position.timestamp}</li>
          </ul>
        ) : (
          <p>No open positions.</p>
        )}
      </div>
    </div>
  )
}

export default LivePositionsREST