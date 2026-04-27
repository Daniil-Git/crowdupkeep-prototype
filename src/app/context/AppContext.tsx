import { createContext, useContext, useState, ReactNode } from "react";
import { currentUser as initialUser, mockReports as initialReports, mockRewards as initialRewards } from "../data/mockData";
import type { Report, Reward } from "../data/mockData";

interface AppState {
  userXP: number;
  reports: Report[];
  rewards: Reward[];
  updateXP: (newXP: number) => void;
  addReport: (report: Report) => void;
  updateReport: (reportId: number, updates: Partial<Report>) => void;
  redeemReward: (rewardId: number) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userXP, setUserXP] = useState(initialUser.xp);
  const [reports, setReports] = useState(initialReports);
  const [rewards, setRewards] = useState(initialRewards);

  const updateXP = (newXP: number) => {
    setUserXP(newXP);
    initialUser.xp = newXP; // Update the mock data too
  };

  const addReport = (report: Report) => {
    setReports((prev) => [...prev, report]);
  };

  const updateReport = (reportId: number, updates: Partial<Report>) => {
    setReports((prev) =>
      prev.map((report) =>
        report.id === reportId ? { ...report, ...updates } : report
      )
    );
  };

  const redeemReward = (rewardId: number) => {
    setRewards((prev) =>
      prev.map((reward) =>
        reward.id === rewardId && reward.stock > 0
          ? { ...reward, stock: reward.stock - 1 }
          : reward
      )
    );
  };

  return (
    <AppContext.Provider
      value={{
        userXP,
        reports,
        rewards,
        updateXP,
        addReport,
        updateReport,
        redeemReward,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
