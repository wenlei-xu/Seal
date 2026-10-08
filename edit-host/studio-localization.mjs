import { parse } from 'acorn';

// Translate Studio UI expressions, never project HTML, media labels or protocol values.
const translations = new Map(Object.entries({
  'Design': '属性', 'Weight': '字重', 'Regular': '常规', 'normal': '常规',
  'Shift + drag/click to edit range': '按住 Shift 拖动或点击选择区间',
  '+ drag/click to edit range': '+ 拖动或点击选择区间',
  'Export': '导出', 'Exporting': '正在导出', 'Rendering…': '正在渲染…', 'Export failed': '导出失败', 'Export encoding': '导出编码',
  'Export matches preview': '导出与预览一致', 'Render': '渲染', 'Rendering': '正在渲染', 'Renders': '导出记录',
  'Render history': '导出历史', 'Render speed': '渲染速度', 'No renders yet': '还没有导出记录',
  'Delete render file': '删除导出文件', 'Hide finished': '隐藏已完成', 'Hide finished renders from this list (files stay on disk)': '隐藏已完成记录，保留磁盘文件',
  'Preview': '预览', 'Preview unavailable': '预览不可用', 'Preview failed to load': '预览加载失败',
  'Preparing preview assets': '正在准备预览素材', 'Retry preview': '重试预览', 'Close preview': '关闭预览',
  'Play': '播放', 'Pause': '暂停', 'Stop': '停止', 'Play / Pause': '播放 / 暂停', 'Play forward': '正向播放', 'Play backward': '反向播放',
  'Playback': '播放', 'Playback rate': '播放速率', 'Playback speed': '播放速度', 'Playback speed options': '播放速度选项',
  'Preview volume': '预览音量', 'Toggle mute': '切换静音', 'Toggle loop': '切换循环播放', 'Toggle fullscreen': '切换全屏',
  'Step 1 frame': '逐帧移动', 'Step 10 frames': '移动十帧', 'Playing the preview': '预览播放',
  'Timeline': '时间线', 'Timeline tools': '时间线工具', 'Timeline tracks': '时间线轨道', 'Timeline track view': '时间线轨道视图',
  'Timeline zoom': '时间线缩放', 'Timeline zoom level': '时间线缩放比例', 'Fit timeline to width': '适配时间线宽度',
  'Track': '轨道', 'Clip': '片段', 'CLIP': '片段', 'Clip actions': '片段操作', 'Split': '拆分',
  'Split at playhead': '在播放头处拆分', 'Split clip at playhead': '在播放头处拆分片段', 'Cut element': '剪切元素',
  'Razor tool: split all tracks': '刀片工具：拆分所有轨道', 'Move the playhead': '移动播放头', 'Move to Playhead': '移至播放头',
  'Move timeline clip': '移动轨道片段', 'Resize timeline clip': '调整轨道片段长度', 'Resize timeline clips': '调整轨道片段长度',
  'Edit timing': '编辑时间', 'Timing': '时间设置', 'Duration': '时长', 'Start': '开始', 'End': '结束', 'Time': '时间',
  'In': '入点', 'Out': '出点', 'In-point': '入点', 'Out-point': '出点', 'Work area': '工作区间',
  'Set in-point': '设置入点', 'Set out-point': '设置出点', 'Clear in-point': '清除入点', 'Clear out-point': '清除出点',
  'Jump to in-point': '跳至入点', 'Jump to out-point': '跳至出点', 'Toggle ripple edit': '切换波纹编辑',
  'Toggle snap': '切换吸附', 'Toggle timeline snapping': '切换时间线吸附', 'Snap to grid': '吸附到网格',
  'Close gap': '闭合间隙', 'Close all gaps': '闭合全部间隙', 'Gap': '间隙', 'Unlink clips': '取消片段关联',
  'Detach audio': '分离音频', 'Freeze frame': '定格画面', 'Delete this clip only': '仅删除此片段',
  'Select clips starting before the playhead': '选择播放头之前开始的片段',
  'Select clips running at or after the playhead': '选择播放头处及之后的片段', 'Select leftward': '向左选择', 'Select rightward': '向右选择',
  'Compositions': '合成', 'Compositions tab': '合成面板', 'Composition canvas': '合成画面', 'Composition preview': '合成预览',
  'Composition navigation': '合成导航', 'Add composition to timeline': '将合成加入时间线', 'Back to parent composition': '返回上级合成',
  'Other compositions': '其他合成', 'No compositions found': '未找到合成', 'Root composition — opens automatically on load': '主合成，加载时自动打开',
  'Assets': '素材', 'Assets tab': '素材面板', 'All project media': '全部工程素材', 'Current file media': '当前文件素材',
  'Project asset': '工程素材', 'Add timeline asset': '添加轨道素材', 'Add to composition at current time': '在当前时间加入合成',
  'Search assets': '搜索素材', 'Search assets...': '搜索素材…', 'Drop media files here': '将媒体文件拖到这里',
  'Drop media files to import': '拖入媒体文件以导入', 'Drop media here': '将素材拖到这里', '+ New track': '+ 新建轨道', 'Upload image asset': '上传图片素材',
  'No image assets yet. Upload one here and Studio will also add it to the Assets tab.': '还没有图片素材。上传后会显示在素材面板中。',
  'Image': '图片', 'Video': '视频', 'Audio': '音频', 'Sound': '声音', 'Embedded video': '嵌入视频',
  'Files': '文件', 'Code': '代码', 'Code Animations': '代码动画', 'New File': '新建文件', 'New Folder': '新建文件夹',
  'Select a file to edit': '选择要编辑的文件', 'File on disk': '磁盘文件', 'Copy path': '复制路径',
  'Binary file — preview not available': '二进制文件，无法预览', 'External URL': '外部链接',
  'Save': '保存', 'Saving…': '正在保存…', 'Saved': '已保存', 'Changes not saved': '修改尚未保存', 'Retry save': '重试保存',
  'Retry saving': '重试保存', 'Unsaved Studio version': '未保存的编辑器版本', 'Review or export Studio draft': '查看或导出编辑草稿',
  'Review or export both': '查看或导出两个版本', 'Overwrite file with Studio version': '用编辑器版本覆盖文件',
  'Overwrite file with recovered Studio draft': '用恢复的编辑草稿覆盖文件', 'Discard Studio edits and reload file': '放弃编辑器修改并重新读取文件',
  'Copy or download this draft before choosing to discard it.': '放弃草稿前，可以先复制或下载。',
  'Reviewing or exporting does not change either version.': '查看或导出不会修改任何版本。',
  'Settings': '设置', 'Close settings': '关闭设置', 'Panels': '面板', 'Panel menu': '面板菜单', 'Reset layout': '重置布局',
  'Shortcuts and tools': '快捷键与工具', 'Editing': '编辑', 'Editing properties': '属性编辑', 'Editing the timeline': '时间线编辑',
  'Select': '选择', 'Selection enabled': '已启用选择', 'Clear selection': '清除选择', 'Nothing selected': '未选中对象',
  'Select an element': '选择元素', 'Select an element in the preview.': '请在预览中选择元素。',
  'Select a single element to edit its properties': '选择单个元素以编辑属性', 'Click any element on the canvas to edit it, or drag to select several.': '点击画面中的元素进行编辑，或拖动框选多个元素。',
  'Layers': '图层', 'No layers': '还没有图层', 'Reorder layers': '调整图层顺序', 'Bring to front': '置于顶层',
  'Bring forward': '上移一层', 'Send to back': '置于底层', 'Send backward': '下移一层', 'Z-index': '层叠顺序',
  'Undo': '撤销', 'Redo': '重做', 'Copy': '复制', 'Paste': '粘贴', 'Cut': '剪切', 'Delete': '删除',
  'Copy element': '复制元素', 'Paste element': '粘贴元素', 'Delete element': '删除元素', 'Delete?': '确认删除？',
  'Delete selected element (no keyframe selected)': '删除选中元素（未选中关键帧时）',
  'Group': '编组', 'Ungroup': '取消编组', 'Group elements': '将元素编组', 'Group name': '组名称', 'Name this group': '为编组命名',
  'Close group': '关闭编组', 'Group these clips to add effects to all of them': '将片段编组后，可以统一添加效果',
  'Effects — group these clips first': '效果：请先将这些片段编组', 'This track cannot be grouped': '此轨道无法编组',
  'Add': '添加', 'Remove': '移除', 'Cancel': '取消', 'Cancelled': '已取消', 'Close': '关闭', 'Done': '完成', 'OK': '确定',
  'Retry': '重试', 'Try again': '重试', 'Reset': '重置', 'Rename': '重命名', 'Click to rename': '点击重命名',
  'Download': '下载', 'Upload': '上传', 'New': '新建', 'Edit': '编辑', 'Send': '发送', 'Dismiss': '关闭提示', 'Dismiss error': '关闭错误提示',
  'Yes': '是', 'No': '否', 'On': '开启', 'Off': '关闭', 'None': '无', 'All': '全部', 'Default': '默认',
  'Width': '宽度', 'Height': '高度', 'Size': '尺寸', 'Position': '位置', 'Rotation': '旋转', 'Rotate': '旋转',
  'Scale': '缩放', 'Opacity': '不透明度', 'Transparency': '透明度', 'Transform': '变换', '3D Transform': '三维变换',
  'Move, resize or rotate': '移动、调整尺寸或旋转', 'Move layer': '移动图层', 'Resize layer': '调整图层尺寸',
  'Resize layer box': '调整图层边框', 'Rotate layer': '旋转图层', 'Rotate selection': '旋转选区', 'Reset layer edits': '重置图层修改',
  'Reset 3D orientation': '重置三维方向', 'Uniform resize': '等比缩放', 'Align': '对齐', 'Perspective': '透视',
  'Canvas': '画面', 'Fit': '适应', 'Fit the whole frame in view': '完整显示画面', 'Zoom in': '放大', 'Zoom out': '缩小',
  'Toggle grid': '切换网格', 'Grid options': '网格选项', 'Grid spacing': '网格间距',
  'Crop': '裁剪', 'Crop presets': '裁剪预设', 'Crop a side': '裁剪一侧', 'Reposition the crop': '调整裁剪位置',
  'Drag the edges freely': '自由拖动边缘', 'Fill': '填充', 'Stroke': '描边', 'Stroke width': '描边宽度',
  'Stroke color': '描边颜色', 'Stroke style': '描边样式', 'Fill color': '填充颜色',
  'Text': '文字', 'Add text': '添加文字', 'Edit text': '编辑文字', 'Text layers': '文字图层', 'Text formatting': '文字格式',
  'Text color': '文字颜色', 'Text colour': '文字颜色', 'Content': '内容', 'Title': '标题', 'Font': '字体', 'Font family': '字体名称',
  'Bold': '加粗', 'Italic': '斜体', 'Underline': '下划线', 'Case': '大小写', 'Style': '样式', 'Text Effects': '文字效果',
  'Import local font files': '导入本地字体', 'No fonts found.': '未找到字体。',
  'Captions': '字幕', 'Caption editing': '字幕编辑', 'Caption editing tabs': '字幕编辑面板', 'Editing captions': '字幕编辑',
  'Edit captions': '编辑字幕', 'Select caption words to edit their style': '选择字幕文字以编辑样式',
  'Select a caption word to edit animations': '选择字幕文字以编辑动画',
  'No captions visible at this frame — scrub to a caption, or select one in the track below': '当前帧没有字幕，请移动到字幕位置或在下方轨道中选择字幕',
  'Animation': '动画', 'Animations': '动画', 'Effects': '效果', 'Entrance': '入场', 'Exit': '退场', 'Transitions': '转场',
  'Add an animation': '添加动画', 'Remove an animation': '移除动画', 'Add a new animation effect to this element': '为此元素添加动画效果',
  '+ Add effect': '+ 添加效果', '+ effect': '+ 效果', 'Reset effects': '重置效果', 'No animations on this element yet — add an effect below to animate it.': '此元素还没有动画，可以在下方添加效果。',
  'Keyframes': '关键帧', 'Keyframes (when an element is selected)': '关键帧（选中元素时）', 'Enable keyframes': '启用关键帧',
  'Add keyframe': '添加关键帧', 'Add a keyframe': '添加关键帧', 'Add / remove keyframe at playhead': '在播放头处添加或移除关键帧',
  'Remove keyframe': '移除关键帧', 'Delete Keyframe': '删除关键帧', 'Delete All Keyframes': '删除全部关键帧',
  'Delete selected keyframe': '删除选中关键帧', 'Previous keyframe': '上一个关键帧', 'Next keyframe': '下一个关键帧',
  'Remove all keyframes': '移除全部关键帧', 'Convert to keyframes': '转换为关键帧', 'Add at playhead': '在播放头处添加',
  'Ease': '缓动', 'Ease In': '缓入', 'Ease Out': '缓出', 'Ease In & Out': '缓入缓出', 'Edit Ease…': '编辑缓动…',
  'Per-keyframe easing': '逐关键帧缓动', 'Curve': '曲线', 'Apply ease to all segments': '将缓动应用到全部片段',
  'Record gesture': '录制动作', 'Gesture recording': '动作录制', 'Auto-record manual edits as keyframes': '自动将手动修改记录为关键帧',
  'Audio FX': '音频效果', 'Audio mixing': '音频混音', 'Audio Gain…': '音频增益…', 'Audio Gain for clips with sound': '调整有声片段的音频增益',
  'Volume': '音量', 'Gain': '增益', 'Muted': '静音', 'Has audio': '包含音频', 'Has audio track': '包含音轨',
  'Edit has audio': '设置音轨状态', 'Edit muted': '设置静音状态', 'Set Gain to': '设置增益为', 'Adjust Gain by': '调整增益',
  'Toggle audio meters': '切换音量表', 'Waveform': '波形', 'waveform unavailable': '波形不可用',
  'Color': '颜色', 'Background': '背景', 'Color grading': '调色', 'Color wheels': '色轮', 'Curves': '曲线',
  'Exposure': '曝光', 'Contrast': '对比度', 'Saturation': '饱和度', 'Brightness': '亮度', 'Hue': '色相',
  'Shadows': '阴影', 'Highlights': '高光', 'Tint': '色调', 'Warmth': '色温', 'Vibrance': '自然饱和度',
  'Sharpness': '锐度', 'Blur': '模糊', 'Vignette': '暗角', 'Grain': '颗粒', 'Strength': '强度', 'Amount': '数量',
  'Reset color grading': '重置调色', 'Copy grade to': '复制调色到', 'Hold to show original': '按住查看原始画面',
  'Import .cube LUT': '导入 .cube LUT', 'Uploaded LUTs': '已导入的 LUT', 'Scopes': '示波器', 'Refresh scopes': '刷新示波器',
  'Presets': '预设', 'Preset': '预设', 'Preset strength': '预设强度', 'Resolution': '分辨率', 'Frame rate': '帧率',
  'Format': '格式', 'Quality': '质量', 'High Quality': '高质量', 'Standard': '标准', 'Quick': '快速',
  'Speed': '速度', 'Speed preset': '速度预设', 'Fast': '快速', 'Slow': '慢速', 'Output': '输出', 'Source': '源文件',
  'About video formats': '关于视频格式', 'Big media files': '大媒体文件', 'Convert source media': '转换源媒体',
  'Variables': '变量', 'Variables panel': '变量面板', '+ Add variable': '+ 添加变量', 'Parameters': '参数',
  'Block params can\'t be edited here — no project file access.': '无法在这里编辑组件参数，尚未获得工程文件访问权限。',
  'This block has no editable parameters.': '此组件没有可编辑参数。', 'Open a composition to manage its variables.': '打开合成后可管理变量。',
  'Search blocks': '搜索组件', 'Search by name, category, or tag…': '按名称、分类或标签搜索…', 'No blocks match your search': '没有匹配的组件',
  'Scenes': '场景', 'No scenes': '还没有场景', 'No scenes found': '未找到场景', 'Select a scene above to inspect': '选择上方场景以查看',
  'Slideshow': '幻灯片', 'Slide Inspector': '幻灯片属性', 'Move slide up': '上移幻灯片', 'Move slide down': '下移幻灯片',
  'Notes': '备注', 'Draft': '草稿', 'Description (optional)': '描述（可选）', 'Speaker notes or script...': '演讲备注或脚本…',
  'Ask agent': '询问助手', 'Copy prompt': '复制提示词', 'Copy prompt to AI agent': '复制提示词给 AI 助手',
  'Chat to change anything in the video': '通过对话修改视频内容', 'Describe what you want to change…': '描述你想修改的内容…',
  'Generate a prompt to paste into your AI agent': '生成可发给 AI 助手的提示词', 'Context included in prompt': '提示词包含的上下文',
  'Copy element info to clipboard': '复制元素信息', 'Copy description to clipboard — paste into agent prompts': '复制描述，用于助手提示词',
  'Copy render command': '复制渲染命令', 'Reload Studio': '重新加载编辑器', 'Checks and warnings': '检查与警告',
  'Console errors in preview': '预览中的运行错误', 'Connecting to project…': '正在连接工程…', 'Out of sync': '尚未同步',
  'No errors or warnings found. Your composition looks good!': '未发现错误或警告。', 'Something went wrong': '发生错误',
  'Cannot edit timeline while recording': '录制期间无法编辑时间线', 'Failed to split timeline clip': '片段拆分失败',
  'Failed to split clips': '片段拆分失败', 'Cut failed': '切割失败', 'Cut conflict': '切割冲突',
  'Cut was saved, but Studio could not refresh it. Reload the preview to resynchronize.': '切割已保存，但预览刷新失败，请重新加载预览。',
  'Copy failed — check clipboard permissions and try again.': '复制失败，请检查剪贴板权限后重试。',
  'Continue anyway': '仍然继续', 'Not now': '暂时不用', 'Clear search': '清空搜索',
  'Inspector': '属性', 'Window': '窗口', 'Lint': '检查', 'Linting…': '正在检查…',
  'Capture': '截图', 'Capturing…': '正在截图…', 'Maximize panel': '最大化面板', 'Restore panel': '还原面板',
  'Toggle ruler': '切换标尺', 'Ruler off': '标尺已关闭', 'Ruler on': '标尺已开启',
  'Toggle safe margins': '切换安全边距', 'Safe margins off': '安全边距已关闭', 'Safe margins on': '安全边距已开启',
  'Snap enabled (S)': '吸附已开启（S）', 'Snap disabled (S)': '吸附已关闭（S）',
  'Grid hidden (G) — right-click for spacing options': '网格已隐藏（G），右键设置间距',
  'Grid visible (G) — right-click for spacing options': '网格已显示（G），右键设置间距',
  'Mute audio': '静音', 'Unmute audio': '取消静音', 'Enable loop playback': '开启循环播放',
  'Disable loop playback': '关闭循环播放', 'Enter fullscreen': '进入全屏', 'Exit fullscreen': '退出全屏',
  'Linked Selection': '关联选择', 'Add keyframe at playhead': '在播放头处添加关键帧', 'Add beat at playhead': '在播放头处添加节拍',
  'Hide thumbnails — labels only': '隐藏缩略图，仅显示名称', 'Show thumbnails': '显示缩略图',
  'Show thumbnails — all clips': '显示所有片段的缩略图', 'Show thumbnails — selected clip only': '仅显示选中片段的缩略图',
  'Timeline tool:': '时间线工具：', 'to timeline at playhead': '到播放头位置', 'Auto ·': '自动 ·',
  'Loading…': '正在加载…', 'Loading...': '正在加载…', 'Loading': '正在加载',
  'Speed preset': '速度预设', 'Automatic': '自动', 'Auto': '自动', 'Original': '原始',
  'Ruler': '标尺', 'Safe margins': '安全边距', 'Toggle': '切换', 'on': '已开启', 'off': '已关闭',
  'Keyboard shortcuts and tools': '快捷键与工具', 'Gesture recording modifiers': '动作录制辅助键',
  'Record x / y position': '录制水平 / 垂直位置', 'Record z depth': '录制纵深',
  'Record rotationX / rotationY': '录制水平 / 垂直轴旋转', 'Record rotation': '录制旋转',
  'Record opacity': '录制不透明度', 'Record scale': '录制缩放',
  'Move element / add keyframe': '移动元素 / 添加关键帧', 'Move entire animation path': '移动整条动画路径',
  'Jump to frame': '跳转到指定帧', 'Loop playback': '循环播放',
  'Exit fullscreen (F)': '退出全屏（F）', 'Enter fullscreen (F)': '进入全屏（F）',
  'Switch to frame display': '切换为帧数显示', 'Switch to time display': '切换为时间显示', 'Preview volume:': '预览音量：',
  'Linked Selection on — a click selects both halves (⌥-click for one)': '关联选择已开启：点击同时选中关联片段，按住 ⌥ 点击可单独选择',
  'Linked Selection off — a click selects one clip': '关联选择已关闭：点击只选中一个片段',
  'Linked clips': '关联片段', 'Snapping on (N)': '吸附已开启（N）', 'Snapping off (N)': '吸附已关闭（N）',
  'Ripple on — keeps the main track gapless': '波纹编辑已开启：保持主轨道连续无间隙',
  'Ripple off — deleting a main-track clip leaves a gap': '波纹编辑已关闭：删除主轨道片段后保留间隙',
  'Hide audio meters': '隐藏音量表', 'Show audio meters': '显示音量表',
  'Motion path endpoints cannot be removed': '无法删除运动路径的端点',
  'Select an animated element to add keyframes': '选择带动画的元素以添加关键帧',
  'Extend motion path to playhead (K)': '将运动路径延伸至播放头（K）',
  'Remove waypoint from motion path (K)': '移除运动路径中的路径点（K）',
  'Add waypoint to motion path (K)': '在运动路径中添加路径点（K）',
  'Remove keyframe at playhead (K)': '移除播放头处的关键帧（K）',
  'Add keyframe at playhead, extends animation (K)': '在播放头处添加关键帧并延长动画（K）',
  'Add keyframe at playhead (K)': '在播放头处添加关键帧（K）', 'Add keyframe (K)': '添加关键帧（K）',
  'Motion path endpoint': '运动路径端点', 'Remove motion path waypoint': '移除运动路径点',
  'Extend motion path to playhead': '将运动路径延伸至播放头', 'Add motion path waypoint': '添加运动路径点',
  'Remove keyframe at playhead': '移除播放头处的关键帧',
  'Auto-record manual edits as keyframes (click to turn off)': '自动将手动修改录制为关键帧，点击关闭',
  'Manual edits will not be recorded as keyframes (click to turn on)': '手动修改不会录制为关键帧，点击开启',
  'Split at playhead (': '在播放头处拆分（', 'Move the playhead inside the clip to split': '将播放头移至片段内部后拆分',
  'Select a clip to split': '选择要拆分的片段', 'Add a music track with beat analysis to place beats': '加入已分析节拍的音乐轨道后，可添加节拍标记',
  'A beat already exists at the playhead': '播放头处已有节拍标记',
  'Show thumbnails — posters stay visible; richer previews appear on interaction': '显示缩略图：保留封面，操作时显示更多预览',
  'Capture current frame': '截取当前帧', 'Capturing frame…': '正在截取当前帧…', 'Capturing frame': '正在截图',
  'A render is already in progress': '已有视频正在渲染', 'Render and export this composition': '渲染并导出此合成',
  'Available when the render finishes': '渲染完成后可下载', 'FFmpeg is not installed. Opens the Renders panel with the install command.': '尚未安装 FFmpeg，打开导出面板查看安装命令。',
  'Install FFmpeg to export. See the note above.': '请先安装 FFmpeg 后再导出，详见上方说明。',
  'Drag to move · ⌥-click to delete': '拖动以移动，按住 ⌥ 点击以删除',
  'Move left/right (negative = left, positive = right)': '左右移动：负值向左，正值向右',
  'Move up/down (negative = up, positive = down)': '上下移动：负值向上，正值向下',
  'How visible (0 = invisible, 1 = fully visible)': '可见程度：0 为完全透明，1 为完全可见',
  'Size multiplier (1 = normal, 2 = double, 0.5 = half)': '尺寸倍数：1 为原始大小，2 为两倍，0.5 为一半',
  'Horizontal stretch (1 = normal)': '水平拉伸：1 为原始比例', 'Vertical stretch (1 = normal)': '垂直拉伸：1 为原始比例',
  'Spin angle (360 = full rotation)': '旋转角度：360 度为完整一圈', 'Move forward/back along the Z axis': '沿 Z 轴向前 / 向后移动',
  'Rotate around the horizontal X axis': '绕水平 X 轴旋转', 'Rotate around the vertical Y axis': '绕垂直 Y 轴旋转',
  'Rotate around the screen-facing Z axis': '绕垂直于屏幕的 Z 轴旋转',
  '3D depth context for child elements; set it on a parent when rotating children in 3D': '设置子元素的三维透视深度；对子元素做三维旋转时，请在父元素上设置',
  "3D depth for THIS element's own X/Y rotation — lower = stronger perspective (try 600–1000)": '设置此元素绕 X / Y 轴旋转时的透视深度，数值越小透视越强，可尝试 600–1000',
  'Pivot point for transforms, for example center center or 50% 50%': '变换的中心点，例如 center center 或 50% 50%',
  'Element width': '元素宽度', 'Element height': '元素高度', 'Like opacity but hides element completely at 0': '与不透明度类似，但值为 0 时会完全隐藏元素',
  'Show or hide the element': '显示或隐藏元素', 'End value for a number roll-up (the number it counts up/down to)': '数字滚动动画的最终数值',
  'When this effect plays': '此效果的播放时间', 'How long this effect lasts': '此效果的持续时长',
  'When this effect begins on the timeline': '此效果在时间线上的开始时间', 'Remove this animation': '移除此动画',
  'Click to type a value': '点击输入数值', 'Scroll or use Arrow keys to adjust': '滚动鼠标或使用方向键调整',
  'Remove — fall back to default': '移除并恢复默认值', 'Remove text field': '移除文字字段',
  'Copy element info for any AI agent': '复制元素信息，可交给 AI 助手使用', 'Copied!': '已复制！',
  'Remove background and save a transparent asset': '移除背景并保存为透明素材', 'Select a project-local image or video asset': '选择工程内的图片或视频素材',
  'Unlink corners': '取消圆角关联', 'Link all corners': '关联全部圆角',
  'Maximum 6 stops': '最多可添加 6 个渐变色标', 'Add a gradient stop': '添加渐变色标', 'Remove stop': '移除色标',
  'Close color picker': '关闭取色器', 'Make this a variable': '将此值设为变量',
  'Disable arc motion': '关闭弧线路径运动', 'Enable arc motion': '开启弧线路径运动',
  'Auto-rotate along path': '沿路径自动旋转', 'Disable auto-rotate along path': '关闭沿路径自动旋转',
  'Rotate element to follow path tangent': '让元素沿路径的切线方向旋转', 'Reset to auto-generated control points': '重置为自动生成的控制点',
  'Rewrite the helper/loop into explicit tweens so this keyframe edits directly': '将辅助函数或循环展开为明确的动画片段，以便直接编辑此关键帧',
  'Apply one ease to all segments': '为全部片段设置同一缓动',
  'Apply one ease to every segment (clears per-segment overrides)': '为全部片段设置同一缓动，并清除各片段的独立设置',
  'Visible — click to hide': '已显示，点击隐藏', 'Hidden — click to show': '已隐藏，点击显示',
  '3D rotation. Arrow keys rotate X/Y, Shift+arrows roll Z, Alt for fine steps; drag to rotate, scroll to change depth': '三维旋转：方向键旋转 X / Y 轴，Shift 加方向键旋转 Z 轴，Alt 可精细调整；拖动以旋转，滚动以调整纵深',
  '3D transform is keyframed — click a field diamond to add keyframes': '三维变换已启用关键帧，点击字段旁的菱形可添加关键帧',
  'Keyframe the 3D transform (animate it over time)': '为三维变换启用关键帧，使其随时间变化', 'Keyframe 3D transform': '为三维变换添加关键帧',
  'Move animation path': '移动动画路径', 'Click the canvas to set the destination': '点击画面以设置目标位置',
  'Set motion destination': '设置运动目标位置', 'Move layer (new keyframe)': '移动图层并新建关键帧', 'Move layer (waypoint)': '移动图层路径点',
  'Edit layer': '编辑图层', 'Reposition crop': '调整裁剪位置', 'Back (Esc, or double-click empty timeline)': '返回（Esc，或双击时间线空白处）',
  'Preview monitor volume': '预览监听音量', 'Lights when the preview reaches −1 dBFS, the export ceiling. Click to reset.': '预览音量达到导出上限 −1 dBFS 时亮起，点击重置',
  'Would move the clip before 0:00': '移动后片段会超出时间线起点', 'Would slip before the start of the file': '滑移后会超出源文件起点',
  'Fewer than three points in the selection': '选区内不足三个控制点', 'No effects': '没有效果',
  'Open effects': '打开效果面板', 'Select group': '选择编组', 'Keyframe actions': '关键帧操作',
  'Merge audio back into video': '将音频重新合并到视频', 'Ungroup (⌘⇧G)': '取消编组（⌘⇧G）',
  'Automated': '已启用自动化', 'Automate': '启用自动化', 'Switch the carve off': '关闭人声避让', 'Switch the carve on': '开启人声避让',
  "How hard to carve: deeper cuts, in more bands, and more room made by dropping the bed's level under the voice. At 0 it carves frequencies only. Moving this re-runs the analysis on what is already here.": '调整人声避让强度：数值越大，削减的频段越多，并降低人声下方的背景音量。为 0 时仅处理频率；调整后会重新分析现有音频。',
  'How much of this preset is applied. Automate it to bring the whole preset in or out over time.': '调整预设强度。启用自动化后，可让整套预设随时间逐渐生效或消退。',
  'Listen to this track and even out its loud and quiet parts.': '分析此轨道，并平衡较响和较轻的部分', 'Bass, middle and treble on one set of faders.': '通过一组推子调整低音、中音和高音',
  'Move up': '上移', 'Move down': '下移', 'Enable': '启用', 'Bypass': '旁通',
  'Choose where to copy these color grading settings': '选择调色设置的复制范围',
  'Copy these color grading settings to the selected scope': '将调色设置复制到选定范围',
  'Add secondary color selection': '添加二级调色选区', 'Remove selected secondary': '移除选中的二级调色选区',
  'Add color selection': '添加颜色选区', 'Selected color matte': '选中颜色的蒙版',
  'Click a color to initialize this selection': '点击颜色以初始化选区', 'Sample color from captured frame': '从截取的画面中取色',
  'Hue range': '色相范围', 'Hue softness': '色相柔和度', 'Use default palette': '使用默认调色板',
  'Add palette color': '添加调色板颜色', 'Effect families': '效果分类',
  'Open this project in the HyperFrames desktop app and edit it with Framey': '在 HyperFrames 桌面应用中打开此工程，并使用 Framey 编辑',
  'Double-click to enter group': '双击进入编组', "This layer can't be reordered": '此图层无法调整顺序',
  'Expand children': '展开子图层', 'Collapse children': '折叠子图层', 'Close block parameters': '关闭组件参数',
  'Disabled until animation editing is applied to playback': '将动画修改应用到播放后才可使用',
  'Select an element on the canvas first': '请先在画面中选择元素', 'Choose a target branch first': '请先选择目标分支',
  'Undo last slideshow edit (⌘Z)': '撤销上一次幻灯片修改（⌘Z）', 'Edit slideshow': '编辑幻灯片',
  'Edit declaration': '编辑变量声明', 'Remove declaration': '移除变量声明', 'No script reads this variable': '没有脚本使用此变量',
  'Set default': '设置默认值', 'Persist this value as the declared default': '将此值保存为变量的默认值',
  'Declare as a string variable': '声明为字符串变量', 'CLI command rendering exactly what the preview shows': '用于渲染当前预览效果的命令',
  'Copy values JSON': '复制变量 JSON', 'Effective values (defaults merged with preview overrides)': '当前生效的值，包含默认值与预览覆盖值',
  'Apply color grading': '应用调色', 'Clear color grading': '清除调色',
  'Linear': '线性', 'Quad In': '二次缓入', 'Quad Out': '二次缓出', 'Quad Ease': '二次缓入缓出',
  'Cubic In': '三次缓入', 'Cubic Out': '三次缓出', 'Cubic Ease': '三次缓入缓出', 'Circular Ease': '圆形缓动',
  'Ease In Back': '回弹缓入', 'Ease Out Back': '回弹缓出', 'Ease In & Out Back': '回弹缓入缓出',
  'Expo In': '指数缓入', 'Expo Out': '指数缓出', 'Gentle': '柔和', 'Bouncy': '弹性', 'Hold': '保持',
  'Ease editor mode': '缓动编辑模式', 'Cubic bezier control points': '三次贝塞尔控制点',
  'Spring bounce': '弹簧回弹', 'Wiggle count': '摆动次数', 'Wiggle type': '摆动类型', 'Wiggle amplitude': '摆动幅度',
  'Previous': '上一个', 'Next': '下一个', 'Convert': '转换', 'to keyframes': '为关键帧', 'keyframe': '关键帧',
  'keyframe at': '关键帧位于', 'keyframes': '关键帧', 'easing': '缓动', 'easing after': '之后的缓动',
  'ease': '缓动', 'ease presets': '缓动预设', 'bezier control point': '贝塞尔控制点', ', snapped to': '，已吸附到',
  'Decrease': '减小', 'Increase': '增大', 'settings': '设置', 'color picker': '取色器', 'Pick': '选择',
  'color': '颜色', 'Palette color': '调色板颜色', 'Remove palette color': '移除调色板颜色',
  'Open': '打开', 'Show': '显示', 'Hide': '隐藏', 'lanes': '自动化通道', 'effects': '效果', 'in the effect rack': '于效果面板',
  'tracks': '轨道', 'clips': '片段', 'effect': '效果', 'applied': '已应用', 'animation': '动画',
  'Actions for': '操作：', 'Pause preview of': '暂停预览', 'Play preview of': '播放预览',
  '— open, drag to timeline, right-click for actions': '：点击打开，拖动加入时间线，右键查看更多操作',
  '— copy path, drag to timeline, right-click for actions': '：复制路径，拖动加入时间线，右键查看更多操作',
  'Open composition': '打开合成', 'preview': '预览', 'Ask agent —': '询问助手：',
  'Bound to variable "': '已绑定变量“', 'automate': '自动化', 'Make room for': '避让',
  'Show what': '查看', 'contains': '包含的效果', "'s effects": '的效果', 'Switch': '切换', 'back on': '重新开启',
  'sets': '设置', 'Sets': '设置', 'settings at once. Open Details to see where they land.': '项设置，打开详情可查看具体作用',
  'is also fading this — the two multiply.': '也在控制淡入淡出，两者会叠加',
  'Peaks': '峰值', 'at this volume; export lowers the whole mix': '；导出时会降低整体混音音量',
  'Out of sync with': '未与', 'by': '同步，偏差为', 'frames': '帧', 'seconds': '秒',
  '— click for Move or Slip into Sync': '，点击以移动或滑移至同步位置', '• Double-click to open': '• 双击打开',
  'Select off-canvas element': '选择画面外的元素', 'Off-canvas:': '画面外：', '— click to select': '，点击选择',
  'Render progress:': '渲染进度：', 'in a new tab': '在新标签页中打开', 'Renders (': '导出记录（',
  'Image source': '图片来源', 'Media source': '媒体来源', 'White Point': '白场', 'Black Point': '黑场', 'Midpoint': '中间调',
  'Roundness': '圆度', 'Feather': '羽化', 'Grain Size': '颗粒大小', 'Roughness': '粗糙度', 'Pixelate': '像素化',
  'LUT Strength': 'LUT 强度', 'LUT strength': 'LUT 强度', 'Uploaded .cube LUT': '已导入的 .cube LUT',
  'Alpha': '透明度', 'Radial': '径向', 'Conic': '圆锥', 'Shape': '形状', 'Pos': '位置', 'Radius': '圆角',
  'Shadow': '阴影', 'Overflow': '溢出', 'Mask': '蒙版', 'Mode': '模式', 'Solid': '纯色', 'Gradient': '渐变',
  'Arc motion': '弧线路径运动', 'Length': '长度', 'Starts at': '开始于', 'Collapse': '折叠',
  'Letter spacing': '字间距', 'Line height': '行高', 'Mask inset': '蒙版内边距', 'Blend': '混合',
  'Layer blur': '图层模糊', 'Backdrop': '背景模糊', 'Angle': '角度', 'Direction': '方向', 'Motion': '运动',
  'Voiceover carve': '人声避让', 'Media start': '媒体起点', 'Loop': '循环', 'Midtones': '中间调', 'Level': '电平',
  'Custom LUT': '自定义 LUT', 'Vignette settings': '暗角设置', 'Grain settings': '颗粒设置', 'Stagger': '错开', 'Intensity': '强度',
  'Ramp up': '渐强', 'Ramp down': '渐弱', 'Swell': '先增强后减弱', 'Dip': '先减弱后增强',
  'Normalize Max Peak to': '将最高峰值标准化为', 'Normalize All Peaks to': '将全部峰值标准化为',
  'Normalize loudness to −16 LUFS': '将响度标准化为 −16 LUFS',
  'image': '图片', 'source': '来源', 'text': '文字', 'background': '背景', 'font': '字体',
  'points': '控制点', 'volume': '音量', 'Fade': '淡入淡出', 'curve': '曲线', 'scope,': '示波器，',
  'min': '最小值', 'max': '最大值', 'softness': '柔和度', 'intensity': '强度', 'preset': '预设',
  'Layers panel': '图层面板', 'The layer tree on the right': '右侧的图层树',
  'Composition variables on the right': '右侧的合成变量', 'Blocks browser': '组件浏览器',
  'The block library in the sidebar': '侧栏的组件库', 'Editing caption words and presets in Studio': '在编辑器中修改字幕文字与预设',
  'The list of past exports': '历史导出列表', 'New branch sequence name': '新分支序列名称',
  'Rename branch': '重命名分支', 'Delete branch': '删除分支', 'Remove hotspot': '移除热点',
  'Target branch sequence': '目标分支序列', 'Hotspot label': '热点名称',
  'Remove fragment at': '移除片段，位置', 'Include': '加入', 'as main-line slide': '作为主线幻灯片',
  'Mark': '标记', 's as hold-point': '秒处为停留点', 'Assign': '分配', 'to branch': '到分支',
  'Edit layer style': '编辑图层样式', 'Edit GSAP animation': '编辑 GSAP 动画', 'Delete GSAP animation': '删除 GSAP 动画',
  'Delete all animations for element': '删除元素的全部动画', 'Add GSAP': '添加 GSAP', 'Remove GSAP': '移除 GSAP',
  'Enable arc path': '开启弧线路径', 'Disable arc path': '关闭弧线路径', 'Update arc segment': '更新弧线路径段',
  'Remove arc path': '移除弧线路径', 'Add keyframe at': '添加关键帧，位置', 'New animation at': '新建动画，位置',
  'Move keyframe to': '移动关键帧至', 'Retime keyframe (resize tween)': '调整关键帧时间与动画时长',
  'Move animated layer (group)': '移动动画图层或编组', 'Resize': '调整尺寸',
  '(extended keyframe)': '（延伸关键帧）', '(keyframe': '（关键帧',
  'Unroll to literal tweens': '展开为明确的动画片段', 'Update keyframe ease': '更新关键帧缓动', 'Update segment ease': '更新片段缓动',
  'Gesture recording (replace set)': '录制动作并替换原有关键帧', 'Gesture recording (merge)': '录制动作并合并关键帧',
  'Gesture recording (new range)': '在新区间录制动作',
  'Best for general use. Smallest file, universal playback.': '适合日常使用，文件较小，兼容常见播放器。',
  'Transparent video. Works in Final Cut Pro, DaVinci Resolve, and most video editors. Large files.': '支持透明视频，可用于 Final Cut Pro、DaVinci Resolve 和多数视频编辑器，文件较大。',
  'Transparent video for web. Smaller than MOV but limited editor support.': '适合网页使用的透明视频，文件比 MOV 更小，但部分编辑器不支持。',
  "This element can't be adjusted directly from the preview.": '此元素无法直接在预览中调整。',
}));

const uiProperties = new Set(['children', 'title', 'label', 'placeholder', 'aria-label', 'aria-description', 'tooltip', 'hint', 'description', 'desc', 'emptyMessage']);
const localizedBundles = new Map();
// These exact phrases are UI-only constants assigned before being passed to a label/tooltip.
const uiConstants = new Set(['Mute audio', 'Unmute audio', 'Enable loop playback', 'Disable loop playback',
  'Enter fullscreen', 'Exit fullscreen', 'Hide thumbnails — labels only', 'Show thumbnails',
  'Show thumbnails — all clips', 'Show thumbnails — selected clip only', 'Ruler', 'Safe margins']);

function localized(value) {
  const trimmed = value.trim();
  const translated = translations.get(trimmed);
  return translated ? value.replace(trimmed, translated) : value;
}

export function localizeStudioBundle(source) {
  if (localizedBundles.has(source)) return localizedBundles.get(source);
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const replacements = new Map();
  function textExpression(node) {
    if (!node) return;
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const value = localized(node.value);
      if (value !== node.value) replacements.set(node.start, { end: node.end, text: JSON.stringify(value) });
    } else if (node.type === 'ConditionalExpression') {
      textExpression(node.consequent); textExpression(node.alternate);
    } else if (node.type === 'LogicalExpression') textExpression(node.right);
    else if (node.type === 'ArrayExpression') node.elements.forEach(textExpression);
    else if (node.type === 'BinaryExpression' && node.operator === '+') {
      textExpression(node.left); textExpression(node.right);
    } else if (node.type === 'TemplateLiteral') {
      node.expressions.forEach(textExpression);
      for (const quasi of node.quasis) {
        const value = quasi.value.cooked;
        if (value !== null && localized(value) !== value) replacements.set(quasi.start, { end: quasi.end,
          text: localized(value).replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${') });
      }
    }
  }
  function walk(node) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Literal' && uiConstants.has(node.value)) textExpression(node);
    if (node.type === 'Property' && !node.computed && uiProperties.has(node.key.name ?? node.key.value)) textExpression(node.value);
    // The pinned resolution label table uses the protocol key "auto" and the display value "Auto".
    if (node.type === 'Property' && !node.computed && (node.key.name ?? node.key.value) === 'auto' && node.value.value === 'Auto') textExpression(node.value);
    // Error strings and long notification text are user-facing. Short generic call arguments may be protocol values.
    if ((node.type === 'NewExpression' && node.callee?.name === 'Error') ||
        (node.type === 'CallExpression' && typeof node.arguments[0]?.value === 'string' && node.arguments[0].value.length > 20)) textExpression(node.arguments[0]);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === 'string') walk(value);
    }
  }
  walk(ast);
  const parts = [];
  let offset = 0;
  for (const [start, replacement] of [...replacements].sort((a, b) => a[0] - b[0])) {
    if (start < offset) continue;
    parts.push(source.slice(offset, start), replacement.text); offset = replacement.end;
  }
  parts.push(source.slice(offset));
  const translated = localizeResolvedHints(parts.join(''));
  if (localizedBundles.size >= 4) localizedBundles.delete(localizedBundles.keys().next().value);
  localizedBundles.set(source, translated);
  return translated;
}

// Translate after a hint has been computed: lookup tables and history/state
// helpers must keep their original values for non-UI callers.
function localizeResolvedHints(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  let used = false;
  function walk(node, parent) {
    if (!node?.type) return;
    if (node.type === 'Property' && parent?.type === 'ObjectExpression' && !node.computed && !node.method && node.kind === 'init' && ['title', 'tooltip', 'aria-label', 'aria-description'].includes(node.key.name ?? node.key.value)) {
      edits.push({ start: node.value.start, end: node.value.end,
        text: `${node.shorthand ? `${node.key.name}:` : ''}__beeftvStudioHint(${source.slice(node.value.start, node.value.end)})` });
      used = true;
      return;
    }
    if (node.type === 'FunctionDeclaration' && node.params[0]?.type === 'ObjectPattern') {
      const props = node.params[0].properties;
      const keys = props.map(prop => prop.key?.name ?? prop.key?.value);
      if (['label', 'children', 'delay', 'side'].every(key => keys.includes(key))) {
        const label = props.find(prop => (prop.key.name ?? prop.key.value) === 'label').value;
        if (label.type === 'Identifier') {
          edits.push({ start: node.body.start + 1, end: node.body.start + 1, text: `${label.name}=__beeftvStudioHint(${label.name});` });
          used = true;
        }
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => walk(child, node));
      else if (value?.type) walk(value, node);
    }
  }
  walk(ast);
  if (!used) return source;
  const parts = [];
  let offset = 0;
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    if (edit.start < offset) continue;
    parts.push(source.slice(offset, edit.start), edit.text); offset = edit.end;
  }
  parts.push(source.slice(offset));
  const dictionary = JSON.stringify([...translations]);
  return `const __beeftvStudioHintText=new Map(${dictionary});\n${__beeftvStudioHint.toString()}\n${parts.join('')}`;
}

function __beeftvStudioHint(value) {
  if (typeof value !== 'string') return value;
  const direct = __beeftvStudioHintText.get(value.trim());
  if (direct) return value.replace(value.trim(), direct);
  // History uses a verb and an edit label composed inside a separate helper.
  const history = /^(Undo|Redo)(?: (.*?))? (\((?:Ctrl|Cmd)\+[^)]+\))$/.exec(value);
  if (history) return `${__beeftvStudioHintText.get(history[1])}${history[2] ? ` ${__beeftvStudioHint(history[2])}` : ''} ${history[3]}`;
  return value;
}
