import type { ScanReport } from "@/lib/db/types";

/** 検出結果（置換件数とシークレットの疑い）を確認するための表示。 */
export function ScanReportView({ report }: { report: ScanReport }) {
  return (
    <details>
      <summary className="small">
        置換 {report.replacements.reduce((sum, item) => sum + item.count, 0)} 件 ／ 除外{" "}
        {report.excluded_paths.length} 件 ／ 検出 {report.findings.length} 件
      </summary>

      {report.findings.length > 0 && (
        <>
          <h3>検出</h3>
          <table>
            <thead>
              <tr>
                <th>ルール</th>
                <th>場所</th>
                <th>該当行</th>
              </tr>
            </thead>
            <tbody>
              {report.findings.slice(0, 200).map((finding, index) => (
                <tr key={`${finding.path}:${finding.line}:${index}`}>
                  <td>
                    {finding.rule}
                    <div className="small muted">{finding.severity}</div>
                  </td>
                  <td className="small">
                    <code>
                      {finding.path}:{finding.line}
                    </code>
                  </td>
                  <td className="small">
                    <code>{finding.excerpt}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {report.replacements.length > 0 && (
        <>
          <h3>置換</h3>
          <ul className="small">
            {report.replacements.map((item) => (
              <li key={item.pattern}>
                <code>{item.pattern}</code>: {item.count} 件
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>除外したパス</h3>
      <ul className="small muted">
        {report.excluded_paths.slice(0, 100).map((path) => (
          <li key={path}>
            <code>{path}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}
