import { useNavigate } from "react-router";
import { ArrowLeft, Trophy, Flame, Crown, Medal, Award } from "lucide-react";
import { mockUsers, currentUser } from "../data/mockData";

export function Leaderboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-[#1976D2] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg">Leaderboard</h1>
      </div>

      {/* Top 3 Podium */}
      <div className="bg-gradient-to-b from-[#1976D2] to-[#1565C0] px-4 py-8 text-white">
        <div className="flex items-end justify-center gap-4 mb-4">
          {/* 2nd Place */}
          {mockUsers[1] && (
            <div className="flex-1 text-center">
              <div className="relative inline-block mb-2">
                <img
                  src={mockUsers[1].avatar}
                  alt={mockUsers[1].username}
                  className="w-16 h-16 rounded-full border-4 border-white/50"
                />
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gray-400 flex items-center justify-center border-2 border-white">
                  <Medal className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-sm truncate px-1">{mockUsers[1].username}</p>
              <p className="text-xs opacity-90">{mockUsers[1].xp} XP</p>
            </div>
          )}

          {/* 1st Place */}
          {mockUsers[0] && (
            <div className="flex-1 text-center">
              <div className="relative inline-block mb-2">
                <img
                  src={mockUsers[0].avatar}
                  alt={mockUsers[0].username}
                  className="w-20 h-20 rounded-full border-4 border-yellow-400"
                />
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center border-2 border-white">
                  <Crown className="w-5 h-5 text-yellow-800" />
                </div>
              </div>
              <p className="text-sm truncate px-1">{mockUsers[0].username}</p>
              <p className="text-xs opacity-90">{mockUsers[0].xp} XP</p>
            </div>
          )}

          {/* 3rd Place */}
          {mockUsers[2] && (
            <div className="flex-1 text-center">
              <div className="relative inline-block mb-2">
                <img
                  src={mockUsers[2].avatar}
                  alt={mockUsers[2].username}
                  className="w-16 h-16 rounded-full border-4 border-white/50"
                />
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-orange-600 flex items-center justify-center border-2 border-white">
                  <Award className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-sm truncate px-1">{mockUsers[2].username}</p>
              <p className="text-xs opacity-90">{mockUsers[2].xp} XP</p>
            </div>
          )}
        </div>
      </div>

      {/* Your Rank Banner */}
      <div className="bg-[#E3F2FD] border-b-2 border-[#1976D2] px-4 py-3">
        <p className="text-center text-[#1976D2]">
          🎯 <span>You're #{currentUser.rank}!</span>
          <span className="block text-sm text-gray-600 mt-1">
            Earn {mockUsers[5].xp - currentUser.xp} more XP to reach #{mockUsers[5].rank}
          </span>
        </p>
      </div>

      {/* Full Rankings */}
      <div className="px-4 py-4">
        <div className="space-y-2">
          {mockUsers.map((user) => (
            <div
              key={user.id}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                user.username === currentUser.username
                  ? "bg-yellow-50 border-2 border-yellow-400"
                  : "bg-gray-50 border border-gray-200"
              }`}
            >
              <div className="w-8 text-center flex-shrink-0">
                {user.rank <= 3 ? (
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      user.rank === 1
                        ? "bg-yellow-400 text-yellow-900"
                        : user.rank === 2
                        ? "bg-gray-400 text-white"
                        : "bg-orange-600 text-white"
                    }`}
                  >
                    {user.rank}
                  </div>
                ) : (
                  <span className="text-gray-500">#{user.rank}</span>
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
                    {user.username === currentUser.username && (
                      <span className="ml-2 text-xs text-yellow-700">(You)</span>
                    )}
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
          ))}
        </div>
      </div>
    </div>
  );
}