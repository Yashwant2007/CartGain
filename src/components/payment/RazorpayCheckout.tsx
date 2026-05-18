"use client";

import { useState } from "react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface RazorpayCheckoutProps {
  plan: string;
  amount: number;
  onSuccess?: (paymentId: string) => void;
  onFailure?: (error: any) => void;
}

export default function RazorpayCheckout({
  plan,
  amount,
  onSuccess,
  onFailure,
}: RazorpayCheckoutProps) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);

    try {
      // Create order on backend
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, amount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create order");
      }

      // Configure Razorpay options
      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "RecoverFlow",
        description: `${plan} Plan`,
        order_id: data.orderId,
        handler: function (response: any) {
          setLoading(false);
          onSuccess?.(response.razorpay_payment_id);
        },
        prefill: {
          name: "",
          email: "",
          contact: "",
        },
        theme: {
          color: "#3B82F6",
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      setLoading(false);
      onFailure?.(error);
      console.error("Payment error:", error);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? "Processing..." : `Pay ₹${amount}`}
    </button>
  );
}
