import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Trophy, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useAppStore } from "../store/appStore";

export function Rewards() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.getCurrentUser());
  const rewards = useAppStore((s) => s.rewards);
  const redeemReward = useAppStore((s) => s.redeemReward);
  const [selectedReward, setSelectedReward] = useState<number | null>(null);
  const [redeemedCode, setRedeemedCode] = useState<string>("");

  const handleRedeem = (rewardId: number) => {
    const voucher = redeemReward(rewardId);
    if (!voucher) {
      const reward = rewards.find((r) => r.id === rewardId);
      const need = (reward?.xpCost ?? 0) - me.xp;
      toast.error(
        need > 0 ? `You need ${need} more XP to redeem this reward` : "Reward unavailable",
      );
      setSelectedReward(null);
      return;
    }
    setRedeemedCode(voucher.code);
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    toast.success("Reward redeemed successfully! 🎉");
  };

  const selectedRewardData = rewards.find((r) => r.id === selectedReward);

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-[#1976D2] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg">Rewards</h1>
      </div>

      <div className="bg-gradient-to-br from-[#4CAF50] to-[#388E3C] px-4 py-8 text-white text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-3">
          <Trophy className="w-10 h-10" />
        </div>
        <p className="text-sm opacity-90 mb-1">Your Balance</p>
        <h2 className="text-4xl mb-1">{me.xp} XP</h2>
        <p className="text-sm opacity-90">Keep earning to unlock more rewards!</p>
      </div>

      <div className="px-4 py-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-[#FF9800]" />
          <h3>Available Rewards</h3>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {rewards.map((reward) => {
            const canAfford = me.xp >= reward.xpCost;
            const outOfStock = reward.stock === 0;
            // Both "out of stock" and "not enough XP" are disabled
            // states — the card content (title, cost, stock count)
            // fades to opacity-60 in either case so the two read as
            // siblings in the "unavailable right now" family. The
            // *differentiator* lives on the image: an out-of-stock
            // reward is a hard, catalogue-wide lock (nothing the user
            // can do from this surface), so the image gets a
            // `grayscale` filter and reads as visually inert. An
            // affordability lock is soft — earn more XP and it opens
            // — so the image stays in colour to keep the incentive
            // visible. The overlay chip remains the labelled signpost
            // for the *why*.
            const disabled = outOfStock || !canAfford;
            return (
              <div
                key={reward.id}
                className={`border rounded-lg overflow-hidden ${
                  outOfStock
                    ? "border-gray-200 bg-gray-50"
                    : canAfford
                      ? "border-[#4CAF50]"
                      : "border-gray-200"
                }`}
              >
                <div className="relative h-32 bg-gray-100">
                  <img
                    src={reward.imageUrl}
                    alt={reward.title}
                    className={`w-full h-full object-cover ${
                      outOfStock ? "grayscale" : ""
                    }`}
                  />
                  {/* Out-of-stock takes precedence over insufficient XP —
                      affordability is moot if the reward can't be redeemed
                      regardless. Same darkening + chip styling so the two
                      unavailable states read as siblings; the chip text
                      labels the difference. */}
                  {outOfStock ? (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="bg-white/90 px-3 py-1 rounded-full text-sm">
                        Out Of Stock
                      </div>
                    </div>
                  ) : !canAfford ? (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="bg-white/90 px-3 py-1 rounded-full text-sm">
                        Need {reward.xpCost - me.xp} more XP
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className={`p-4 ${disabled ? "opacity-60" : ""}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="mb-1">{reward.title}</h4>
                      <p className="text-sm text-gray-600">{reward.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-[#FF9800]" />
                      <span className="text-sm">{reward.xpCost} XP</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{reward.stock} left</span>
                      <Button
                        size="sm"
                        onClick={() => setSelectedReward(reward.id)}
                        disabled={!canAfford || reward.stock === 0}
                        className={canAfford && !disabled ? "bg-[#4CAF50] hover:bg-[#388E3C]" : ""}
                      >
                        Redeem
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={selectedReward !== null && !redeemedCode}
        onOpenChange={() => setSelectedReward(null)}
      >
        <DialogContent className="max-w-[340px]">
          <DialogHeader>
            <DialogTitle>Confirm Redemption</DialogTitle>
          </DialogHeader>
          {selectedRewardData && (
            <div className="pt-4">
              <div className="mb-4">
                <img
                  src={selectedRewardData.imageUrl}
                  alt={selectedRewardData.title}
                  className="w-full h-32 object-cover rounded-lg mb-3"
                />
                <h4 className="mb-1">{selectedRewardData.title}</h4>
                <p className="text-sm text-gray-600 mb-3">{selectedRewardData.description}</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Cost:</span>
                    <span>{selectedRewardData.xpCost} XP</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Your balance:</span>
                    <span>{me.xp} XP</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span>After redemption:</span>
                    <span className="text-[#4CAF50]">
                      {me.xp - selectedRewardData.xpCost} XP
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedReward(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleRedeem(selectedRewardData.id)}
                  className="flex-1 bg-[#4CAF50] hover:bg-[#388E3C]"
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!redeemedCode}
        onOpenChange={() => {
          setRedeemedCode("");
          setSelectedReward(null);
        }}
      >
        <DialogContent className="max-w-[340px]">
          <DialogHeader>
            <DialogTitle>🎉 Redemption Successful!</DialogTitle>
          </DialogHeader>
          <div className="pt-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#4CAF50] flex items-center justify-center text-white mb-4">
              <Trophy className="w-10 h-10" />
            </div>
            <p className="text-sm text-gray-600 mb-4">Your redemption code:</p>
            <div className="bg-green-50 border-2 border-green-300 border-dashed rounded-lg p-4 mb-4">
              <p className="text-xl font-mono text-[#388E3C]">{redeemedCode}</p>
            </div>
            <p className="text-xs text-gray-500 mb-4">Save this code to redeem your reward</p>
            <Button
              onClick={() => {
                setRedeemedCode("");
                setSelectedReward(null);
              }}
              className="w-full bg-[#1976D2] hover:bg-[#1565C0]"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
