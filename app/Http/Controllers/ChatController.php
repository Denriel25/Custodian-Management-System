<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Services\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChatController extends Controller
{
    public function send(Request $request, ChatService $chat): JsonResponse
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'max:1000'],
            'page' => ['nullable', 'string', 'max:200'],
        ], ['message.required' => 'Please type a question.']);

        $result = $chat->ask($request->user(), trim($data['message']), (string) ($data['page'] ?? ''));

        if (! $result['ok']) {
            return response()->json(
                ['ok' => false, 'code' => $result['code'], 'message' => $result['message']],
                $result['status']
            );
        }

        return response()->json(['ok' => true, 'reply' => $result['reply']]);
    }

    public function history(Request $request): JsonResponse
    {
        $rows = ChatMessage::query()->where('user_id', $request->user()->id)
            ->orderByDesc('id')->limit(30)->get()->reverse()->values();

        return response()->json([
            'ok' => true,
            'messages' => $rows->map(fn ($m) => ['from' => $m->role === 'user' ? 'user' : 'bot', 'text' => $m->content])->all(),
        ]);
    }

    public function clear(Request $request): JsonResponse
    {
        ChatMessage::query()->where('user_id', $request->user()->id)->delete();

        return response()->json(['ok' => true]);
    }
}
