; NSIS 自定义安装脚本
; 功能：开机自启、卸载旧版本、安装向导
;
; 注意：以下变量由 electron-builder 自动通过命令行定义，不可重复 !define：
;   PRODUCT_NAME, PRODUCT_FILENAME, APP_GUID, UNINSTALL_APP_KEY, APP_FILENAME 等

!macro customHeader
  ; 注册表路径（使用 electron-builder 注入的 UNINSTALL_APP_KEY 作为卸载键）
  !define AUTOSTART_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
  !define UNINSTALL_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
!macroend

!macro preInit
  ; 安装前检查并卸载旧版本（使用 electron-builder 的 GUID 查找）
  ReadRegStr $0 HKLM "${UNINSTALL_REG_KEY}" "QuietUninstallString"
  ${If} $0 != ""
    ExecWait '$0 --force'
  ${EndIf}
!macroend

!macro customInstall
  ; 写入开机自启注册表（HKLM 系统级，用户无法在任务管理器中关闭）
  WriteRegStr HKLM "${AUTOSTART_REG_KEY}" "${PRODUCT_NAME}" '"$INSTDIR\${PRODUCT_FILENAME}.exe"'
!macroend

!macro customUnInstall
  ; 删除开机自启注册表
  DeleteRegValue HKLM "${AUTOSTART_REG_KEY}" "${PRODUCT_NAME}"
!macroend

!macro customRemoveFiles
  ; 保留用户数据目录
  ; 用户数据在 %APPDATA%/science-museum-digital-human/ 不受卸载影响
!macroend
