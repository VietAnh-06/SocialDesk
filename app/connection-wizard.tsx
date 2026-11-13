'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConnectionHealth, FacebookSetup } from '../lib/connection-status';

export type WizardRequest = {
  mode: 'connect' | 'reconnect' | 'check';
  connectionId?: string;
  outcome?: string;
};
type PageConnection = {
  id: string;
  name: string;
  kind: 'page' | 'profile';
  remote_id: string;
};
const outcomes: Record<string, string> = {
  success:
    'Facebook đã trả về các Fanpage được cấp quyền. Hãy kiểm tra quyền của Fanpage bạn muốn sử dụng.',
  cancelled:
    'Bạn đã hủy hoặc chưa đồng ý cấp quyền trên Facebook. Có thể thử lại khi sẵn sàng.',
  empty:
    'Facebook chưa trả về Fanpage nào. Hãy dùng đúng tài khoản có quyền quản lý và chọn Fanpage trên màn hình cấp quyền.',
  page_missing:
    'Bạn chưa cấp quyền cho đúng Fanpage cần kết nối lại. Kết nối cũ vẫn được giữ. Hãy thử lại và chọn đúng Fanpage.',
  failed:
    'Chưa kết nối được với Facebook. Bạn có thể thử lại. Nếu vẫn gặp lỗi, hãy nhờ người cài đặt kiểm tra ứng dụng.',
};
async function load<T>(
  path: string,
  signal: AbortSignal,
  method = 'GET',
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    signal,
    credentials: 'same-origin',
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || 'Chưa kiểm tra được. Hãy thử lại.');
  return result;
}
const time = (value: number) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(value);
function Tick({ ok }: { ok: boolean | null }) {
  return (
    <span
      className={`wizard-tick ${ok === true ? 'ok' : ok === false ? 'missing' : 'unknown'}`}
      aria-hidden="true"
    >
      {ok === true ? '✓' : ok === false ? '!' : '–'}
    </span>
  );
}

export default function ConnectionWizard({
  request,
  connections,
  reports,
  onChecked,
  onClose,
}: {
  request: WizardRequest;
  connections: PageConnection[];
  reports: Record<string, ConnectionHealth>;
  onChecked: (report: ConnectionHealth) => void;
  onClose: () => void;
}) {
  const pages = connections.filter((c) => c.kind === 'page');
  const initialId = pages.some((p) => p.id === request.connectionId)
    ? request.connectionId!
    : pages[0]?.id || '';
  const [step, setStep] = useState(
    request.mode === 'check' || request.outcome === 'success'
      ? 3
      : request.outcome
        ? 2
        : 1,
  );
  const [setup, setSetup] = useState<FacebookSetup | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [setupRevision, setSetupRevision] = useState(0);
  const [selectedId, setSelectedId] = useState(initialId);
  const [reconnectId, setReconnectId] = useState(
    request.mode === 'reconnect' ? request.connectionId || '' : '',
  );
  const [checkRevision, setCheckRevision] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [includeComments, setIncludeComments] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = pages.find((p) => p.id === selectedId);
  const report = reports[selectedId];
  const canRequestComments = !!setup?.commentsPermissionRequestEnabled;
  const missingPermissions =
    report?.permissions.filter(
      (p) =>
        p.granted === false && (p.group !== 'comments' || canRequestComments),
    ) || [];
  const friendlyTitle = report
    ? {
        ready: 'Fanpage đã sẵn sàng',
        limited: 'Cho phép thêm chức năng',
        expired: 'Facebook cần bạn đăng nhập lại',
        unavailable: 'Hãy kết nối lại Fanpage',
        unknown: 'Chưa kiểm tra được kết nối',
        configuration_required: 'Cần người cài đặt hỗ trợ',
      }[report.status]
    : '';
  const friendlyMessage = report
    ? report.status === 'ready'
      ? report.commentsReady
        ? 'Bạn có thể bắt đầu quản lý bài viết và bình luận của Fanpage.'
        : canRequestComments
          ? 'Bạn đã có thể đăng, sửa và xóa bài viết. Nếu muốn quản lý bình luận, bấm “Bật quản lý bình luận”.'
          : 'Bạn đã có thể đăng, sửa và xóa bài viết. Chức năng bình luận cần được người cài đặt thiết lập thêm.'
      : report.status === 'limited'
        ? report.postingReady && !report.commentsReady
          ? 'Bạn đã có thể đăng bài. Để trả lời và quản lý bình luận, bấm “Cho phép thêm quyền” rồi đồng ý trên Facebook.'
          : 'Bấm “Cho phép thêm quyền” rồi đồng ý các chức năng bạn muốn sử dụng trên Facebook.'
        : report.status === 'expired'
          ? 'Bấm “Đăng nhập lại Facebook”, đăng nhập tài khoản của bạn và chọn lại Fanpage.'
          : report.status === 'configuration_required'
            ? 'Người cài đặt cần hoàn tất thiết lập trên máy này. Bạn có thể để sau và quay lại khi ứng dụng sẵn sàng.'
            : report.status === 'unknown'
              ? 'Bạn có thể thử kiểm tra lại. Nếu vẫn chưa được, hãy nhờ người cài đặt hỗ trợ.'
              : 'Bấm “Kết nối lại Fanpage” và chọn đúng trang bạn muốn quản lý.'
    : '';
  const canConnect = !!setup?.ready && !setupLoading && !setupError;
  const reconnectPage = pages.find((p) => p.id === reconnectId);
  const params = new URLSearchParams({ guided: '1' });
  if (reconnectId) params.set('connectionId', reconnectId);
  if (includeComments && canRequestComments)
    params.set('permissions', 'comments');

  useEffect(() => {
    const root = dialog.current;
    root?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      root?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setSetupLoading(true);
        setSetupError('');
      }
    });
    load<FacebookSetup>('facebook/setup', controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSetup(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSetupError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSetupLoading(false);
      });
    return () => controller.abort();
  }, [setupRevision]);
  useEffect(() => {
    if (step !== 3 || !selectedId || !setup || setupLoading || setupError)
      return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setChecking(true);
        setCheckError('');
      }
    });
    load<ConnectionHealth>(
      `connections/${encodeURIComponent(selectedId)}/check`,
      controller.signal,
      'POST',
    )
      .then((value) => {
        if (!controller.signal.aborted) onChecked(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCheckError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [
    step,
    selectedId,
    setup,
    setupLoading,
    setupError,
    checkRevision,
    onChecked,
  ]);

  async function copyCallback() {
    if (!setup?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(setup.callbackUrl);
      setCopyNotice('Đã sao chép địa chỉ quay lại.');
    } catch {
      setCopyNotice(
        'Trình duyệt chưa cho phép sao chép. Hãy chọn đường dẫn trong ô và sao chép thủ công.',
      );
    }
  }
  function reconnect(withComments = false) {
    setReconnectId(selectedId);
    setIncludeComments(withComments && canRequestComments);
    setStep(canConnect ? 2 : 1);
    setLeaving(false);
  }
  const canSeeResult =
    request.mode === 'check' || request.outcome === 'success' || !!report;
  const completeStep = (index: number) =>
    step > index + 1 &&
    (index === 0
      ? setup?.ready
      : index === 1
        ? !!pages.length
        : report?.status === 'ready');
  return (
    <dialog
      ref={dialog}
      className="connection-wizard"
      aria-label="Hướng dẫn kết nối Facebook"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="wizard-heading">
        <div>
          <span className="eyebrow">KẾT NỐI VỚI SOCIALDESK</span>
          <h2>Kết nối Fanpage của bạn</h2>
          <p>Làm theo 3 bước dưới đây. SocialDesk sẽ dẫn bạn từng bước.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Đóng hướng dẫn kết nối"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <nav className="wizard-steps" aria-label="Các bước kết nối">
        {[
          ['Bắt đầu', 'Chuẩn bị tài khoản'],
          ['Chọn Fanpage', 'Thực hiện trên Facebook'],
          ['Hoàn tất', 'Sẵn sàng sử dụng'],
        ].map(([title, subtitle], index) => (
          <button
            key={title}
            className={
              step === index + 1
                ? 'active'
                : completeStep(index)
                  ? 'complete'
                  : ''
            }
            aria-current={step === index + 1 ? 'step' : undefined}
            disabled={
              index === 1 ? !canConnect : index === 2 ? !canSeeResult : false
            }
            onClick={() => setStep(index + 1)}
          >
            <span className="wizard-step-number">
              {completeStep(index) ? '✓' : index + 1}
            </span>
            <span>
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className="wizard-body">
        {step === 1 && (
          <section aria-label="Bước 1: Bắt đầu">
            <span className="wizard-step-caption">BƯỚC 1 / 3</span>
            <h3>Bắt đầu kết nối Fanpage</h3>
            <p className="wizard-intro">
              Chuẩn bị tài khoản Facebook bạn thường dùng để quản lý Fanpage.
              SocialDesk sẽ mở Facebook để bạn đăng nhập và chọn trang.
            </p>
            {setupLoading ? (
              <output className="wizard-loading">
                Đang chuẩn bị kết nối cho bạn…
              </output>
            ) : setupError ? (
              <p className="form-error" role="alert">
                {setupError}
              </p>
            ) : (
              setup && (
                <>
                  <div
                    className={`wizard-summary ${setup.ready ? 'ready' : 'attention'}`}
                  >
                    <Tick ok={setup.ready} />
                    <div>
                      <strong>
                        {setup.ready
                          ? 'Đã sẵn sàng để bắt đầu'
                          : 'Máy này cần được người cài đặt thiết lập'}
                      </strong>
                      <p>
                        {setup.ready
                          ? 'Bấm “Bắt đầu kết nối” để xem cách chọn Fanpage trên Facebook.'
                          : 'Hãy nhờ người cài đặt hoàn tất phần thiết lập một lần. Bạn chưa cần thao tác gì trên Facebook.'}
                      </p>
                    </div>
                  </div>
                  <details className="wizard-advanced">
                    <summary>Dành cho người cài đặt</summary>
                    <ul className="wizard-checklist">
                      {setup.checks.map((check) => (
                        <li key={check.key}>
                          <Tick ok={check.ok} />
                          <div>
                            <strong>{check.label}</strong>
                            <p>{check.message}</p>
                          </div>
                          <span
                            className={
                              check.ok
                                ? 'wizard-check-ok'
                                : 'wizard-check-missing'
                            }
                          >
                            {check.ok ? 'Đã có' : 'Cần xử lý'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="wizard-tip">
                      Việc kiểm tra trên máy chưa xác nhận callback đã được đăng
                      ký trong Meta App. Nếu Facebook báo lỗi chuyển hướng, hãy
                      đối chiếu địa chỉ trong phần hướng dẫn cho người cài đặt.
                    </div>
                    <p>
                      Chạy <code>CAU-HINH.cmd</code> để nhập Meta App ID và App
                      Secret, sau đó mở lại <code>CHAY-LOCAL.cmd</code>. Giữ
                      trống địa chỉ Internet khi chỉ dùng trên máy.
                    </p>
                    <p>
                      Đăng ký chính xác địa chỉ quay lại sau trong Facebook
                      Login → Settings → Valid OAuth Redirect URIs. Việc chấp
                      nhận HTTP localhost phụ thuộc chế độ thử nghiệm của Meta
                      App.
                    </p>
                    <div className="copy-field">
                      <code>
                        {setup.callbackUrl || 'Chưa tạo được địa chỉ quay lại'}
                      </code>
                      <button
                        className="button secondary small-button"
                        disabled={!setup.callbackUrl}
                        onClick={() => void copyCallback()}
                      >
                        Sao chép
                      </button>
                    </div>
                    {copyNotice && <output>{copyNotice}</output>}
                    <p>
                      Kết nối mặc định chỉ xin quyền đăng bài. Để bật bình luận,
                      thêm <code>pages_read_user_content</code> và{' '}
                      <code>pages_manage_engagement</code> trong Meta App, rồi
                      chạy <code>CAU-HINH.cmd</code> và bật xin quyền bình luận.
                      Nếu Facebook báo Invalid Scopes, tắt tùy chọn bình luận và
                      kiểm tra lại các quyền trong Meta App.
                    </p>
                    <a
                      className="text-button"
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở Meta for Developers ↗
                    </a>
                  </details>
                </>
              )
            )}
          </section>
        )}
        {step === 2 && (
          <section aria-label="Bước 2: Chọn Fanpage">
            <span className="wizard-step-caption">BƯỚC 2 / 3</span>
            <h3>
              {reconnectPage
                ? `Kết nối lại ${reconnectPage.name}`
                : 'Chọn Fanpage bạn muốn quản lý'}
            </h3>
            <p className="wizard-intro">
              Bấm nút bên dưới để mở Facebook. Trên Facebook, làm lần lượt như
              sau:
            </p>
            {request.outcome && request.outcome !== 'success' && (
              <div className="wizard-summary attention" role="alert">
                <Tick ok={false} />
                <p>{outcomes[request.outcome] || outcomes.failed}</p>
              </div>
            )}
            <ol className="wizard-instructions">
              <li>
                <span>1</span>
                <div>
                  <strong>Đăng nhập trên Facebook</strong>
                  <p>
                    Dùng tài khoản có quyền quản lý Fanpage. Bạn nhập mật khẩu
                    trực tiếp trên Facebook.
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Chọn đúng Fanpage</strong>
                  <p>
                    {reconnectPage
                      ? `Chọn “${reconnectPage.name}” để cập nhật kết nối đang có. Bài viết đã lưu được giữ nguyên.`
                      : 'Chọn các Fanpage bạn muốn quản lý trong SocialDesk.'}
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Cho phép SocialDesk quản lý Fanpage</strong>
                  <p>
                    Cho phép đọc và đăng bài viết
                    {includeComments && canRequestComments
                      ? ', quản lý bình luận'
                      : ''}
                    . Sau đó bấm tiếp tục để quay về SocialDesk.
                  </p>
                </div>
              </li>
            </ol>
            <div className="wizard-comment-option">
              <label>
                <input
                  type="checkbox"
                  checked={includeComments && canRequestComments}
                  disabled={!canRequestComments}
                  onChange={(e) => setIncludeComments(e.target.checked)}
                />
                <strong>Thêm chức năng quản lý bình luận (tùy chọn)</strong>
              </label>
              <p>
                {canRequestComments
                  ? 'Chọn nếu bạn muốn đọc, trả lời, ẩn và xóa bình luận. Nếu Facebook báo lỗi quyền, bỏ chọn để kết nối đăng bài trước.'
                  : 'Người cài đặt cần bật chức năng này trước. Bạn vẫn có thể kết nối Fanpage để đăng bài ngay.'}
              </p>
            </div>
            {setupLoading && (
              <output className="wizard-loading">Đang chuẩn bị kết nối…</output>
            )}
            {setupError && (
              <p className="form-error" role="alert">
                {setupError}
              </p>
            )}
            {!setupLoading && !setupError && setup && !setup.ready && (
              <p className="form-error" role="alert">
                Máy này chưa được thiết lập xong. Quay lại bước Bắt đầu và nhờ
                người cài đặt hỗ trợ.
              </p>
            )}
            <details className="wizard-advanced">
              <summary>Không thấy Fanpage hoặc không cấp được quyền?</summary>
              <p>
                Thử đăng nhập bằng tài khoản bạn thường dùng để quản lý Fanpage.
                Nếu Fanpage thuộc doanh nghiệp hoặc người khác, hãy nhờ người
                quản trị cho phép tài khoản của bạn quản lý nội dung trang đó.
              </p>
              <p>
                Khi Facebook hỏi các chức năng được phép sử dụng, hãy đồng ý
                đăng bài. Bình luận chỉ được hỏi khi bạn chọn thêm chức năng
                này. Nếu vẫn chưa kết nối được, nhờ người cài đặt hỗ trợ.
              </p>
            </details>
          </section>
        )}
        {step === 3 && (
          <section aria-label="Bước 3: Hoàn tất">
            <span className="wizard-step-caption">BƯỚC 3 / 3</span>
            <h3>Hoàn tất kết nối</h3>
            <p className="wizard-intro">
              SocialDesk đang kiểm tra Fanpage bạn vừa chọn. Khi mọi thứ đã sẵn
              sàng, bạn có thể bắt đầu quản lý bài viết. Trạng thái bình luận
              được hiển thị riêng bên dưới.
            </p>
            {request.outcome === 'success' && (
              <p className="wizard-tip">{outcomes.success}</p>
            )}
            {!pages.length ? (
              <div className="wizard-summary attention">
                <Tick ok={false} />
                <div>
                  <strong>Chưa có Fanpage để kiểm tra</strong>
                  <p>Quay lại bước 2 để đăng nhập và chọn Fanpage.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="wizard-page-picker">
                  <label className="field">
                    Fanpage của bạn
                    <select
                      aria-label="Fanpage cần kiểm tra"
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                    >
                      {pages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={checking || setupLoading}
                    onClick={() => setCheckRevision((v) => v + 1)}
                  >
                    {checking ? 'Đang kiểm tra…' : 'Kiểm tra lại Fanpage'}
                  </button>
                </div>
                {checking && (
                  <output className="wizard-loading">
                    Đang xác minh kết nối với Facebook…
                  </output>
                )}
                {checkError && (
                  <p className="form-error" role="alert">
                    {checkError}
                  </p>
                )}
                {report && (
                  <div aria-busy={checking}>
                    <div
                      className={`wizard-summary ${report.status === 'ready' ? 'ready' : 'attention'}`}
                    >
                      <Tick
                        ok={
                          report.status === 'ready'
                            ? true
                            : report.status === 'limited' ||
                                report.status === 'expired'
                              ? false
                              : null
                        }
                      />
                      <div>
                        <strong>{friendlyTitle}</strong>
                        <p>{friendlyMessage}</p>
                      </div>
                    </div>
                    <div className="wizard-feature-status">
                      <span>
                        <Tick ok={report.postingReady} />
                        Đăng bài:{' '}
                        {report.postingReady === true
                          ? 'Sẵn sàng'
                          : report.postingReady === false
                            ? 'Cần cho phép'
                            : 'Đang chờ kiểm tra'}
                      </span>
                      <span>
                        <Tick ok={report.commentsReady} />
                        Bình luận:{' '}
                        {report.commentsReady === true
                          ? 'Sẵn sàng'
                          : report.commentsReady === false
                            ? canRequestComments
                              ? 'Cần cho phép'
                              : 'Cần người cài đặt bật'
                            : 'Đang chờ kiểm tra'}
                      </span>
                    </div>
                    {!!missingPermissions.length && (
                      <div className="wizard-missing-features">
                        <strong>Facebook cần bạn cho phép thêm:</strong>
                        <ul>
                          {missingPermissions.map((p) => (
                            <li key={p.key}>{p.label}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <details className="wizard-advanced">
                      <summary>
                        Thông tin kiểm tra dành cho người cài đặt
                      </summary>
                      <p>{report.message}</p>
                      <ul className="wizard-checklist permission-checks">
                        {report.permissions.map((permission) => (
                          <li key={permission.key}>
                            <Tick ok={permission.granted} />
                            <div>
                              <strong>{permission.label}</strong>
                              <code>{permission.key}</code>
                            </div>
                            <span
                              className={
                                permission.granted === true
                                  ? 'wizard-check-ok'
                                  : permission.granted === false
                                    ? 'wizard-check-missing'
                                    : ''
                              }
                            >
                              {permission.granted === true
                                ? 'Đã cấp'
                                : permission.granted === false
                                  ? 'Chưa cấp'
                                  : 'Chưa xác minh'}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="wizard-checked-at">
                        Kiểm tra lúc {time(report.checkedAt)}
                        {report.expiresAt
                          ? ` · Hạn phiên: ${time(report.expiresAt)}`
                          : ''}
                        . Quyền quản trị Fanpage và các giới hạn Facebook vẫn áp
                        dụng khi thực hiện thao tác.
                      </p>
                    </details>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
      <footer className="wizard-footer">
        <button
          className="button secondary"
          onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
        >
          {step === 1 ? 'Để sau' : 'Quay lại'}
        </button>
        <span>Bước {step} trong 3</span>
        {step === 1 && (
          <div className="button-row">
            <button
              className="text-button"
              disabled={setupLoading}
              onClick={() => setSetupRevision((v) => v + 1)}
            >
              Kiểm tra lại
            </button>
            <button
              className="button primary"
              disabled={!canConnect}
              onClick={() => setStep(2)}
            >
              Bắt đầu kết nối →
            </button>
          </div>
        )}
        {step === 2 && (
          <a
            className={`button primary ${!canConnect || leaving ? 'is-disabled' : ''}`}
            aria-disabled={!canConnect || leaving}
            href={canConnect ? `/api/facebook/connect?${params}` : undefined}
            onClick={(e) => {
              if (!canConnect || leaving) e.preventDefault();
              else setLeaving(true);
            }}
          >
            {leaving
              ? 'Đang mở Facebook…'
              : reconnectId
                ? 'Đăng nhập lại trên Facebook ↗'
                : 'Mở Facebook và chọn Fanpage ↗'}
          </a>
        )}
        {step === 3 && (
          <div className="button-row">
            {report?.status === 'ready' &&
              report.commentsReady === false &&
              canRequestComments && (
                <button
                  className="button secondary"
                  disabled={checking || setupLoading}
                  onClick={() => reconnect(true)}
                >
                  Bật quản lý bình luận
                </button>
              )}
            <button
              className="button primary"
              disabled={checking || setupLoading}
              onClick={() => {
                if (report?.status === 'configuration_required') setStep(1);
                else if (report?.status === 'unknown')
                  setCheckRevision((v) => v + 1);
                else if (report && report.status !== 'ready' && selected)
                  reconnect(
                    report.status === 'limited' && !!report.postingReady,
                  );
                else onClose();
              }}
            >
              {checking
                ? 'Đang kiểm tra…'
                : report?.status === 'configuration_required'
                  ? 'Xem hướng dẫn cho người cài đặt'
                  : report?.status === 'unknown'
                    ? 'Thử kiểm tra lại'
                    : report && report.status !== 'ready' && selected
                      ? report.status === 'limited'
                        ? 'Cho phép thêm quyền'
                        : 'Đăng nhập lại Facebook'
                      : report?.status === 'ready'
                        ? 'Bắt đầu sử dụng'
                        : 'Đóng hướng dẫn'}
            </button>
          </div>
        )}
      </footer>
    </dialog>
  );
}
