import React from "react";

export default function OrderCard({ order, getSideColor, getOrderStatusColor }) {
  return (
    <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Left section */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xl font-bold text-gray-800">
              {order.symbol || "N/A"}
            </h3>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${getSideColor(
                order.side
              )} bg-gray-50`}
            >
              {order.side || "N/A"}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${getOrderStatusColor(
                order.orderStatus
              )}`}
            >
              {order.orderStatus || "Unknown"}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-gray-500 font-medium">Type:</span>
              <p className="font-medium text-gray-800 mt-1">
                {order.orderType || "N/A"}
              </p>
            </div>

            <div>
              <span className="text-gray-500 font-medium">Time in Force:</span>
              <p className="font-medium text-gray-800 mt-1">
                {order.timeInForce || "N/A"}
              </p>
            </div>
          </div>
        </div>

        {/* Right section */}
        <div className="lg:text-right">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4 lg:gap-2">
            <div>
              <span className="text-gray-500 font-medium text-sm">
                Quantity:
              </span>
              <p className="text-xl font-bold text-gray-800">
                {order.qty || "0"}
              </p>
            </div>

            <div>
              <span className="text-gray-500 font-medium text-sm">Price:</span>
              <p className="text-lg font-semibold text-gray-800">
                {order.price === "0" || !order.price ? "Market" : order.price}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Execution details */}
      {(order.cumExecQty || order.cumExecValue || order.cumExecFee) && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            {order.cumExecQty && (
              <div>
                <span className="text-gray-500 font-medium">Executed Qty:</span>
                <p className="font-medium text-gray-800">{order.cumExecQty}</p>
              </div>
            )}

            {order.cumExecValue && (
              <div>
                <span className="text-gray-500 font-medium">Executed Value:</span>
                <p className="font-medium text-gray-800">{order.cumExecValue}</p>
              </div>
            )}

            {order.cumExecFee && (
              <div>
                <span className="text-gray-500 font-medium">Fee:</span>
                <p className="font-medium text-gray-800">{order.cumExecFee}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
