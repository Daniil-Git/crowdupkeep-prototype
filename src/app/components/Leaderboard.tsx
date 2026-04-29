import { useNavigate } from "react-router";
import { ArrowLeft, Trophy, Flame, Crown, Medal, Award } from "lucide-react";
import { useAppStore } from "../store/appStore";

export function Leaderboard() {
  const navigate = useNavigate();
  const users = useAppStore((s) => s.users);
  const me = useAppStore((s) => s.getCurrentUser());

  const ranked = [...users].sort((a, b) => b.xp - a.xp || b.streak - a.streak);
  const myRank = ranked.findIndex((u) => u.id === me.id) + 1;
  const nextUser = myRank > 1 ? ranked[myRank - 2] : null;

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-[#1976D2] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg">Leaderboard</h1>
      </div>

      <div className="bg-gradient-to-b from-[#1976D2] to-[#1565C0] px-4 py-8 text-white">
        <div className="flex items-end justify-center gap-4 mb-4">
          {ranked[1] && (
            <div className="flex-1 text-center">
              <div className="relative inline-block mb-2">
                <img
                  src={ranked[1].avatar}
                  alt={ranked[1].username}
                  className="w-16 h-16 rounded-full border-4 border-white/50"
                />
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gray-400 flex items-center justify-center border-2 border-white">
                  <Medal className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-sm truncate px-1">{ranked[1].username}</p>
              <p className="text-xs opacity-90">{ranked[1].xp} XP</p>
            </div>
          )}

          {ranked[0] && (
            <div className="flex-1 text-center">
              <div className="relative inline-block mb-2">
                <img
                  src={ranked[0].avatar}
                  alt={ranked[0].username}
                  className="w-20 h-20 rounded-full border-4 border-yellow-400"
                />
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center border-2 border-white">
                  <Crown className="w-5 h-5 text-yellow-800" />
                </div>
              </div>
              <p className="text-sm truncate px-1">{ranked[0].username}</p>
              <p className="text-xs opacity-90">{ranked[0].xp} XP</p>
            </div>
          )}

          {ranked[2] && (
            <div className="flex-1 text-center">
              <div className="relative inline-block mb-2">
                <img
                  src={ranked[2].avatar}
                  alt={ranked[2].username}
                  className="w-16 h-16 rounded-full border-4 border-white/50"
                />
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-orange-600 flex items-center justify-center border-2 border-white">
                  <Award className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-sm truncate px-1">{ranked[2].username}</p>
              <p className="text-xs opacity-90">{ranked[2].xp} XP</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#E3F2FD] border-b-2 border-[#1976D2] px-4 py-3">
        <p className="text-center text-[#1976D2]">
          🎯 <span>You're #{myRank}!</span>
          {nextUser && (
            <span className="block text-sm text-gray-600 mt-1">
              Earn {Math.max(0, nextUser.xp - me.xp + 1)} more XP to reach #{myRank - 1}
            </span>
          )}
        </p>
      </div>

      <div className="px-4 py-4">
        <div className="space-y-2">
          {ranked.map((user, idx) => {
            const rank = idx + 1;
            const isMe = user.id === me.id;
            return (
              <div
                key={user.id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  isMe
                    ? "bg-yellow-50 border-2 border-yellow-400"
                    : "bg-gray-50 border border-gray-200"
                }`}
              >
                <div className="w-8 text-center flex-shrink-0">
                  {rank <= 3 ? (
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        rank === 1
                          ? "bg-yellow-400 text-yellow-900"
                          : rank === 2
                            ? "bg-gray-400 text-white"
                            : "bg-orange-600 text-white"
                      }`}
                    >
                      {rank}
                    </div>
                  ) : (
                    <span className="text-gray-500">#{rank}</span>
                  )}
                </div>

                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-12 h-12 rounded-full"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate">
                      {user.username}
                      {isMe && <span className="ml-2 text-xs text-yellow-700">(You)</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 mt-0.5">
                    <div className="flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-[#1976D2]" />
                      <span>{user.xp} XP</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-orange-500" />
                      <span>{user.streak} days</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
