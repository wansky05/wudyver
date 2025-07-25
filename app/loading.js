"use client";
import React from "react";
import { Icon } from "@iconify/react";

const Loading = () => {
  return (
    <div className="flex flex-col items-center justify-center app_height">
      <Icon
        icon="svg-spinners:blocks-shuffle-3"
        className="mb-4 text-5xl text-emerald-500"
      />
      <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
        Memuat...
      </p>
    </div>
  );
};

export default Loading;