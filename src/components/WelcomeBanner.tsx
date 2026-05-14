import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";

export default function WelcomeBanner() {
  const nickname = useAppStore((s) => s.nickname);
  const navigate = useNavigate();

  if (!nickname) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 dark:text-gray-400 text-sm">Welcome back,</span>
      <button
        onClick={() => navigate("/settings")}
        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline text-sm"
        title="Edit settings"
      >
        {nickname}
      </button>
    </div>
  );
}
