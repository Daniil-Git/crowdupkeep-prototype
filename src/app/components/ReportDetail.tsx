import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, MapPin, MessageCircle, CheckCircle, Star } from "lucide-react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { PostSolutionModal } from "./PostSolutionModal";
import { Username } from "./Username";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { toast } from "sonner";
import { icon as leafletIcon } from "leaflet";
import { useAppStore, type ReportComment } from "../store/appStore";

const blueIcon = leafletIcon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface CommentNode extends ReportComment {
  replies: CommentNode[];
}

// Recursive comment tree, derived from the flat parentId list. Mirrors the
// shape that the API layer's listCommentsForReport produces server-side.
function buildTree(flat: ReportComment[]): CommentNode[] {
  const map = new Map<number, CommentNode>();
  flat.forEach((c) => map.set(c.id, { ...c, replies: [] }));
  const roots: CommentNode[] = [];
  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parentId != null && map.has(c.parentId)) {
      map.get(c.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function CommentItem({
  comment,
  depth = 0,
  onReply,
}: {
  comment: CommentNode;
  depth?: number;
  onReply: (parentId: number, text: string) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");

  const handleReply = () => {
    const text = replyText.trim();
    if (!text) return;
    onReply(comment.id, text);
    setReplyText("");
    setShowReply(false);
  };

  return (
    <div className={`${depth > 0 ? "ml-6 mt-2" : "mb-3"}`}>
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-[#1976D2] text-white text-xs flex items-center justify-center">
            {comment.authorName[0].toUpperCase()}
          </div>
          <span className="text-sm">{comment.authorName}</span>
          <span className="text-xs text-gray-500">
            {new Date(comment.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm text-gray-700 mb-2">{comment.text}</p>
        <button onClick={() => setShowReply(!showReply)} className="text-xs text-[#1976D2]">
          Reply
        </button>
      </div>

      {showReply && (
        <div className="ml-6 mt-2">
          <Textarea
            placeholder="Write your reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="text-sm mb-2"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleReply}>
              Post Reply
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReply(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {comment.replies.map((reply) => (
        <CommentItem key={reply.id} comment={reply} depth={depth + 1} onReply={onReply} />
      ))}
    </div>
  );
}

export function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportId = Number(id);
  const report = useAppStore((s) => s.reports.find((r) => r.id === reportId));
  const addComment = useAppStore((s) => s.addComment);
  const acceptSolution = useAppStore((s) => s.acceptSolution);

  const [showSolution, setShowSolution] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  if (!report) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p>Report not found</p>
      </div>
    );
  }

  const allPhotos = [
    ...report.photos,
    ...report.solutions.flatMap((s) => s.proofPhotos),
  ];
  const safeIndex = Math.min(currentPhotoIndex, Math.max(0, allPhotos.length - 1));
  const tree = buildTree(report.comments);

  const handlePostComment = () => {
    const text = newComment.trim();
    if (!text) return;
    addComment({ reportId: report.id, text });
    setNewComment("");
    toast.success("Comment posted!");
  };

  const handleReply = (parentId: number, text: string) => {
    addComment({ reportId: report.id, text, parentId });
    toast.success("Reply posted!");
  };

  const handleAcceptSolution = (solutionId: number) => {
    const result = acceptSolution(report.id, solutionId);
    if (result) {
      toast.success(
        `Solution accepted — ${result.solverName} earned ${result.xpAwarded} XP!`,
      );
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-[#1976D2] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg">Report Details</h1>
      </div>

      <div className="pb-6">
        <div className="px-4 py-4 border-b">
          <div className="flex items-start justify-between mb-2">
            <h2 className="flex-1 pr-2">{report.title}</h2>
            <Badge
              variant={
                report.status === "solved"
                  ? "default"
                  : report.status === "in-progress"
                    ? "secondary"
                    : "destructive"
              }
            >
              {report.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span>Difficulty {report.difficulty}</span>
            </div>
            <span>•</span>
            <span>Earn {report.difficulty * 50} XP</span>
          </div>
        </div>

        {/* Photo carousel — wrapped with ImageWithFallback so a 404'd
            Unsplash URL collapses to a placeholder rather than rendering as
            a broken-image icon. */}
        <div className="relative bg-gray-100">
          <ImageWithFallback
            src={allPhotos[safeIndex]}
            alt={`Report photo ${safeIndex + 1}`}
            className="w-full h-64 object-cover"
          />
          {allPhotos.length > 1 && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
              {allPhotos.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPhotoIndex(index)}
                  className={`w-2 h-2 rounded-full ${
                    index === safeIndex ? "bg-white" : "bg-white/50"
                  }`}
                  aria-label={`Photo ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Map container is its own stacking context with a clipped
            overflow box. Leaflet sets z-indices on its internal panes
            (markers, popups, controls) up to ~700; isolating the parent
            keeps those from punching through the photo above or the
            description below. */}
        <div className="relative isolate z-0 h-48 overflow-hidden border-b">
          <MapContainer
            center={[report.geometry.lat, report.geometry.lng]}
            zoom={15}
            style={{ height: "100%", width: "100%", zIndex: 0 }}
            scrollWheelZoom={false}
            dragging={false}
            zoomControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[report.geometry.lat, report.geometry.lng]} icon={blueIcon} />
          </MapContainer>
        </div>

        <div className="px-4 py-4 border-b">
          <div className="flex items-start gap-2 mb-3">
            <MapPin className="w-4 h-4 text-gray-500 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">{report.address}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Reported by{" "}
                <Username authorUsername={report.createdByName} variant="lowercase" />
                {" "}• {new Date(report.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <p className="text-gray-700">{report.description}</p>
        </div>

        {report.solutions.length > 0 && (
          <div className="px-4 py-4 border-b">
            <h3 className="mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#4CAF50]" />
              Solutions
            </h3>
            {report.solutions.map((solution) => (
              <div
                key={solution.id}
                className="bg-green-50 border border-green-200 rounded-lg p-3 mb-2"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">{solution.submittedByName}</span>
                  <Badge variant="default" className="bg-[#4CAF50]">
                    {solution.status}
                  </Badge>
                </div>
                <p className="text-sm text-gray-700 mb-2">{solution.description}</p>
                <p className="text-xs text-gray-500">
                  {new Date(solution.submittedAt).toLocaleString()}
                </p>
                {solution.status !== "accepted" && (
                  <Button
                    size="sm"
                    onClick={() => handleAcceptSolution(solution.id)}
                    className="bg-[#4CAF50] hover:bg-[#388E3C] mt-2"
                  >
                    Accept Solution
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-4">
          <h3 className="mb-3 flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Comments ({report.comments.length})
          </h3>
          <div className="mb-4">
            {tree.map((comment) => (
              <CommentItem key={comment.id} comment={comment} onReply={handleReply} />
            ))}
          </div>

          <div className="border-t pt-4">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="mb-2"
              rows={2}
            />
            <Button onClick={handlePostComment} size="sm">
              Post Comment
            </Button>
          </div>
        </div>

        {report.status !== "solved" && (
          <div className="px-4 pb-4">
            <Button
              onClick={() => setShowSolution(true)}
              className="w-full bg-[#4CAF50] hover:bg-[#388E3C]"
            >
              Post Solution
            </Button>
          </div>
        )}
      </div>

      <PostSolutionModal
        open={showSolution}
        onOpenChange={setShowSolution}
        reportId={report.id}
      />
    </div>
  );
}
