const $ = (id) => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing popup element: #${id}`);
  }
  return element;
};

export function getPopupElements() {
  return {
    urlList: $('urlList'),
    urlListPane: $('urlListPane'),
    urlTemplatePane: $('urlTemplatePane'),
    urlCountBadge: $('urlCountBadge'),
    listModeButton: $('listModeButton'),
    templateModeButton: $('templateModeButton'),
    urlTemplate: $('urlTemplate'),
    urlTemplateHistoryButton: $('urlTemplateHistoryButton'),
    urlTemplateClearButton: $('urlTemplateClearButton'),
    urlTemplateHistoryMenu: $('urlTemplateHistoryMenu'),
    urlTemplateItems: $('urlTemplateItems'),
    urlTemplateItemsHistoryButton: $('urlTemplateItemsHistoryButton'),
    urlTemplateItemsClearButton: $('urlTemplateItemsClearButton'),
    urlTemplateItemsHistoryMenu: $('urlTemplateItemsHistoryMenu'),
    urlPreviewCount: $('urlPreviewCount'),
    urlPreviewList: $('urlPreviewList'),
    extractLinksButton: $('extractLinksButton'),
    urlListHistoryButton: $('urlListHistoryButton'),
    urlListClearButton: $('urlListClearButton'),
    urlListHistoryMenu: $('urlListHistoryMenu'),
    linkSelectorPanel: $('linkSelectorPanel'),
    linkSelectorSummary: $('linkSelectorSummary'),
    linkSelectorCloseButton: $('linkSelectorCloseButton'),
    linkSelectorSearch: $('linkSelectorSearch'),
    linkSelectorAllButton: $('linkSelectorAllButton'),
    linkSelectorNoneButton: $('linkSelectorNoneButton'),
    linkSelectorInvertButton: $('linkSelectorInvertButton'),
    linkSelectorList: $('linkSelectorList'),
    linkSelectorCancelButton: $('linkSelectorCancelButton'),
    linkSelectorApplyButton: $('linkSelectorApplyButton'),
    applyTemplateButton: $('applyTemplateButton'),
    captureSettings: $('captureSettings'),
    captureMode: $('captureMode'),
    delay: $('delay'),
    schedulePanel: $('schedulePanel'),
    schedulePanelCloseButton: $('schedulePanelCloseButton'),
    scheduleSummary: $('scheduleSummary'),
    scheduleTaskList: $('scheduleTaskList'),
    scheduleUrlPreview: $('scheduleUrlPreview'),
    scheduleAt: $('scheduleAt'),
    scheduleButton: $('scheduleButton'),
    scheduleNewButton: $('scheduleNewButton'),
    scheduleSaveButton: $('scheduleSaveButton'),
    cancelScheduleButton: $('cancelScheduleButton'),
    folder: $('folder'),
    currentTabButton: $('currentTabButton'),
    currentWindowTabsButton: $('currentWindowTabsButton'),
    settingsButton: $('settingsButton'),
    startButton: $('startButton'),
    pauseButton: $('pauseButton'),
    stopButton: $('stopButton'),
    statusText: $('statusText')
  };
}
