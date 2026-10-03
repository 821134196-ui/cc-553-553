#!/usr/bin/env bash
# 接口冒烟测试：验证业务红线。需先启动后端 (npm run dev:backend)
set -u
BASE=http://localhost:3000/api
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d,ensure_ascii=False,indent=1))" 2>/dev/null || cat; }
login() { curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])"; }

ADMIN=$(login admin admin123)
COL=$(login collector collect123)
REV=$(login reviewer review123)
ZHANG=$(login zhang zhang123)

auth() { curl -s -H "Authorization: Bearer $1" "${@:2}"; }
post() { curl -s -X POST -H "Authorization: Bearer $1" -H 'Content-Type: application/json' "$2" -d "$3"; }

echo "==== 1) 收料员过磅：同批膜 BATCH-Z-01 再次过磅 → 重复警告 ===="
RESP=$(post "$COL" "$BASE/tickets" '{"farmerId":4,"plotId":1,"filmType":"SHED","batchCode":"BATCH-Z-01","expectedKg":80}')
echo "$RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print('warning =',d.get('warning'));print('ticket id =',d['ticket']['id'],'duplicateOfId =',d['ticket']['duplicateOfId'])"
DUP_ID=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['ticket']['id'])")

echo "==== 2) 收料员补分拣后，试图审批重复单（审核员）→ 必须 400 驳回 ===="
post "$COL" "$BASE/tickets/$DUP_ID/sorting" '{"netWeight":80,"qualityGrade":"A","dirtRate":0.01}' >/dev/null
echo "-- 重复单直接通过（应 400）："
post "$REV" "$BASE/review/$DUP_ID" '{"approved":true}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('statusCode'),d.get('message'))"
echo "-- 正确做法：驳回（应 200/201）："
post "$REV" "$BASE/review/$DUP_ID" '{"approved":false,"reason":"冒烟测试：同批膜重复过磅"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('status =',d.get('status'))"

echo "==== 3) 管理员过磅后自审 → 403（收料员不能审批自己的单据）===="
SELF=$(post "$ADMIN" "$BASE/tickets" '{"farmerId":5,"plotId":3,"filmType":"MULCH","expectedKg":10}')
SELF_ID=$(echo "$SELF" | python3 -c "import sys,json;print(json.load(sys.stdin)['ticket']['id'])")
post "$ADMIN" "$BASE/tickets/$SELF_ID/sorting" '{"netWeight":10,"qualityGrade":"A","dirtRate":0.02}' >/dev/null
post "$ADMIN" "$BASE/review/$SELF_ID" '{"approved":true}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('statusCode'),d.get('message'))"

echo "==== 4) 重量修正：收料员修自己的单 → 403；审核员修（留痕）→ 成功 ===="
post "$COL" "$BASE/tickets/$SELF_ID/corrections" '{"fieldName":"NET","newValue":9.5,"reason":"测试"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('statusCode'),d.get('message'))"
post "$REV" "$BASE/tickets/$SELF_ID/corrections" '{"fieldName":"NET","newValue":9.5,"reason":"复磅扣减0.5kg"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('status =',d.get('status'),'netWeight =',d.get('netWeight'),'修正记录数 =',len(d.get('corrections',[])))"

echo "==== 5) 当期额度已满：审核员通过该单 → 合格量裁剪为 0 ===="
post "$REV" "$BASE/review/$SELF_ID" '{"approved":true}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('status =',d.get('status'),'eligibleWeight =',d.get('eligibleWeight'))"

echo "==== 6) 兑付幂等：对张种植重复发起兑付 → 两次都返回同一回执，金额不增加 ===="
post "$ADMIN" "$BASE/payouts" '{"periodId":1,"farmerId":4}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('第1次 duplicated =',d['duplicated'],'receipt =',d['payout']['receiptNo'],'amount =',d['payout']['amount'])"
post "$ADMIN" "$BASE/payouts" '{"periodId":1,"farmerId":4,"idempotencyKey":"manual-xyz"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('第2次 duplicated =',d['duplicated'],'receipt =',d['payout']['receiptNo'],'amount =',d['payout']['amount'])"

echo "==== 7) 张种植只看得到自己的收据与进度 ===="
auth "$ZHANG" "$BASE/farmer/dashboard" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for s in d['summary']: print(' 期次',s['periodCode'],'提交',s['submittedKg'],'合格',s['eligibleKg'],'预计补贴',s['estimatedYuan'],'已兑付',s['paidYuan'])
print(' 回执数 =',len(d['payouts']))"

echo "==== 8) 王种植试图看全部单据 → 只能看到自己的 ===="
auth "$ZHANG" "$BASE/tickets" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(' 张种植看到单据数 =',len(d),'(应仅含本人)')"
