/** 创建审批轨迹环形缓冲。 */
export function createApprovalTrail(limit = 200) {
    const records = [];
    let seq = 0;
    return {
        record(entry) {
            records.push({ seq: seq++, time: Date.now(), sessionId: '', execSessionId: '', ...entry });
            if (records.length > limit)
                records.splice(0, records.length - limit);
        },
        snapshot() {
            return records.slice();
        },
    };
}
