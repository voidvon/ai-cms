
<%

'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
	'函数名：gotTopic
	'作  用：截字符串，汉字一个算两个字符，英文算一个字符
	'参  数：str   ----原字符串
	'       strlen ----截取长度
	'返回值：截取后的字符串
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
	function gotTopic(str,strlen)
		if str="" then
			gotTopic=""
			exit function
		end if
		dim l,t,c, i
		str=replace(replace(replace(replace(str,"&nbsp;"," "),"&quot;",chr(34)),"&gt;",">"),"&lt;","<")
		l=len(str)
		t=0
		for i=1 to l
			c=Abs(Asc(Mid(str,i,1)))
			if c>255 then
				t=t+2
			else
				t=t+1
			end if
			if t>=strlen then
				gotTopic=left(str,i) 
				exit for
			else
				gotTopic=str
			end if
		next
		gotTopic=replace(replace(replace(replace(gotTopic," ","&nbsp;"),chr(34),"&quot;"),">","&gt;"),"<","&lt;")
	end function
	
'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 	
	
Function noHtml(str)
	Dim re
	Set re=New RegExp
	re.IgnoreCase =True
	re.Global=True
	re.Pattern="(\<.*?\>)"
	str=re.Replace(str,"")
	re.Pattern="(\<\/.*?\>)"
	str=re.Replace(str,"")
	noHtml=str
End Function
	
	
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'过滤SQL非法字符并格式化html代码
function Replace_Text(fString)
if isnull(fString) then
Replace_Text=""
exit function
else
fString=trim(fString)
fString=replace(fString,">","")
fString=replace(fString,"<","")
fString=replace(fString,"'","")
fString=replace(fString,";","；")
fString=replace(fString,"--","—")
fString=server.htmlencode(fString)
Replace_Text=fString
end if	
end function


 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'会员发布的各种信息过滤
Function changechr(fString)
If Not IsNull(fString) Then
fString = trim(fString)
 fString = replace(fString, "--", "——")  
fString = replace(fString, "%20", "")    
fString = replace(fString, "==", "")     
 fString = Replace(fString, CHR(32), " ")	 
fString = Replace(fString, CHR(9), " ")			 
fString = Replace(fString, CHR(34), "&quot;")
fString = Replace(fString, CHR(39), "&#39;")	 
fString = Replace(fString, CHR(13), "")
fString = Replace(fString, CHR(10) & CHR(10), "</P><P> ")
fString = Replace(fString, CHR(10), "<BR> ")
changechr = fString
End If
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'过滤SQL非法字符
Function checkStr(Chkstr)
	dim Str:Str=Chkstr
	if isnull(Str) then
		checkStr = ""
		exit Function
	else
		Str=replace(Str,"'","")
		Str=replace(Str,";","")
		Str=replace(Str,"--","")
		checkStr=Str
	end if
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'检测传递的参数是否为数字型
Function Chkrequest(Para)
Chkrequest=False
If Not (IsNull(Para) Or Trim(Para)="" Or Not IsNumeric(Para)) Then
   Chkrequest=True
End If
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'检测传递的参数是否为日期型
Function Chkrequestdate(Para)
Chkrequestdate=False
If Not (IsNull(Para) Or Trim(Para)="" Or Not IsDate(Para)) Then
   Chkrequestdate=True
End If
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'得到当前页面的地址 
Function Get_Url() 
 on error resume next 
Dim strTemp 
If LCase(Request.ServerVariables("HTTPS")) = "off" Then 
strTemp = "http://" 
Else 
strTemp = "https://" 
End If 
strTemp = strTemp & CheckStr(Request.ServerVariables("SERVER_NAME")) 
If Request.ServerVariables("SERVER_PORT") <> 80 Then strTemp = strTemp & ":" & CheckStr(Request.ServerVariables("SERVER_PORT")) 
strTemp = strTemp & CheckStr(Request.ServerVariables("URL")) 
If Trim(Request.QueryString) <> "" Then strTemp = strTemp & "?" & CheckStr(Trim(Request.QueryString)) 
Get_Url = strTemp  
End Function 

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'检查用户是否在浏览器里输入了本页的地址
Function CheckReferer()
    Dim sReferer, Icheck
    CheckReferer = True
    sReferer = Request.ServerVariables("HTTP_REFERER")
    ServerIP = Request.ServerVariables("LOCAL_ADDR")
    Icheck = InStr(sReferer, "ServerIP")
    If Icheck = 0 Then
    CheckReferer = False
    End If
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'日期格式化
Function FormatDate(DT,tp)
	dim Y,M,D
	Y=Year(DT)
	M=month(DT)
	D=Day(DT)
	if M<10 then M="0"&M
	if D<10 then D="0"&D
	select case tp
	case 1 FormatDate=Y&"年"&M&"月"&D&"日"
	case 2 FormatDate=Y&"/"&M&"/"&D
	case 3 FormatDate=M&"/"&D
    case 4 FormatDate=Y&"\"&M&"\"&D
	case 5 FormatDate=Y&"-"&M&"-"&D

	end select
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'不允许外部提交数据的选择
Function ChkPost()
    dim HTTP_REFERER,SERVER_NAME
	dim server_v1,server_v2
	chkpost=false
    SERVER_NAME=CheckStr(Request.ServerVariables("SERVER_NAME"))
	HTTP_REFERER=CheckStr(Request.ServerVariables("HTTP_REFERER"))
	server_v1=Cstr(HTTP_REFERER)
	server_v2=Cstr(SERVER_NAME)
	if mid(server_v1,8,len(server_v2))<>server_v2 then
		chkpost=false
	else
		chkpost=true
	end if
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'构造上传图片文件名随机数
function MakedownName()
dim fname
fname = now()
fname = replace(fname,"-","")
fname = replace(fname," ","") 
fname = replace(fname,":","")
fname = replace(fname,"PM","")
fname = replace(fname,"AM","")
fname = replace(fname,"上午","")
fname = replace(fname,"下午","")
fname = int(fname) + int((10-1+1)*Rnd + 1)
MakedownName=fname
end function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'Email检测
function IsValidEmail(email)
dim names, name, i, c
IsValidEmail = true
names = Split(email, "@")
if UBound(names) <> 1 then
   IsValidEmail = false
   exit function
end if
for each name in names
   if Len(name) <= 0 then
     IsValidEmail = false
     exit function
   end if
   for i = 1 to Len(name)
     c = Lcase(Mid(name, i, 1))
     if InStr("abcdefghijklmnopqrstuvwxyz_-.", c) <= 0 and not IsNumeric(c) then
       IsValidEmail = false
       exit function
     end if
   next
   if Left(name, 1) = "." or Right(name, 1) = "." then
      IsValidEmail = false
      exit function
   end if
next
if InStr(names(1), ".") <= 0 then
   IsValidEmail = false
   exit function
end if
i = Len(names(1)) - InStrRev(names(1), ".")
if i <> 2 and i <> 3 then
   IsValidEmail = false
   exit function
end if
if InStr(email, "..") > 0 then
   IsValidEmail = false
end if
end function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'Jmail邮件发送(一)
Function SendJmail(Email,Topic,MailBody)


	Dim JMail
	 on error resume next
	Set JMail = Server.CreateObject("JMail.SMTPMail")
	JMail.LazySend            = true
	JMail.silent            = true
	JMail.Charset            = "gb2312"
	JMail.ContentType      = "text/html"
	JMail.Sender            = ""&SMTPServer&"" 
	JMail.ReplyTo            = ""&SystemEmail&"" 
	JMail.SenderName      = ""&webname&"邮件发送系统"
	JMail.Subject            = Topic
	JMail.SimpleLayout      = true
	JMail.Body            = MailBody
	JMail.Priority            = 1
	JMail.AddRecipient Email
	JMail.AddHeader "Originating-IP", GBL_IPAddress
	
	If JMail.Execute() = false Then
		SendJmail = 0
	Else
		SendJmail = 1
	End If
	JMail.Close
	Set JMail = Nothing

End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


'Jmail邮件发送(二)
function SendMailto(emailSMTP,HOPE_send,HOPE_sendname,HOPE_Servername,HOPE_ServerPwd,cname,cemail,emailtitle,emailcontant)
on error resume next
  '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 'cname	收件人的姓名
'cemail	收件人的Email
'emailtitle	收件人的标题
'emailcontant	收件人的内容

'emailSMTP	发送者的SMTP服务器
'HOPE_send  发送者地址
'HOPE_sendname  发送者的姓名
'HOPE_Servername 	发送者的用户名
'HOPE_ServerPwd 	发送者的密码
  '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  Set JMail = Server.CreateObject("JMail.Message") 
'是否将信头编码成iso-8859-1字符集. 缺省是True 
JMail.ISOEncodeHeaders = True 
'如果JMail.silent设置为true,ErrorCode包含的是错误代码 
JMail.Silent = True 
'设置标题和内容编码，如果标题有中文，必须设定编码为gb2312 
JMail.Charset = "gb2312" 
'JMail.ContentType = "text/html" '如果发内嵌附件一定要注释掉这行，重要！ 
JMail.From =HOPE_send  ' 发送者地址 admin@admin.com
JMail.FromName =HOPE_sendname ' 发送者姓名 
JMail.MailServerUserName = HOPE_Servername ' 身份验证的用户名 
JMail.MailServerPassword = HOPE_ServerPwd ' 身份验证的密码 
'加入新的收件人 
JMail.AddRecipient cemail, cname 
'JMail.AddRecipientBCC Email '密件收件人的地址 
'JMail.AddRecipientCC Email '邮件抄送者的地址 
JMail.Subject = emailtitle 
JMail.Body = emailcontant 
 '增加一个普通附件 
'JMail.AddAttachment(Server.MapPath()) 
'增加一个嵌入式附件 
' The return value of AddAttachment is used as a 
' reference to the image in the HTMLBody. 
'contentId = JMail.AddAttachment(Server.MapPath("images/email.gif")) 
 '只有HTML格式支持嵌入图片附件，我们采用HTML格式的邮件内容 
' As only HTML formatted emails can contain inline images 
' we use HTMLBody and appendHTML 
JMail.HTMLBody = "<html><body><br>"&emailcontant 
JMail.appendHTML "<br><br></body></html>" 

'如果对方信箱不支持HTML格式邮件，我们仍需要给他一个友善的提示 
' But as not all mailreaders are capable of showing HTML emails 
' we will also add a standard text body 
JMail.Body = "Too bad you can't read HTML-mail." 
JMail.appendText " " 
JMail.Send(emailSMTP) '执行邮件发送（通过邮件服务器地址）smtp.域名.com 

JMail.Close() 
Set JMail = Nothing 
End function
 
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 

'分页
Function listPages(LinkFile) 
   if not (rs.eof and rs.bof) then
	gopage=currentpage
	totalpage=n
	blockPage=Int((gopage-1)/28)*28+1
 
	If LCase(Request.ServerVariables("HTTPS")) = "off" Then 
    strTemp = "http://" 
    Else 
    strTemp = "https://" 
    End If 
    strTemp = strTemp & CheckStr(Request.ServerVariables("SERVER_NAME")) 
    If Request.ServerVariables("SERVER_PORT") <> 80 Then strTemp = strTemp & ":" & CheckStr(Request.ServerVariables("SERVER_PORT")) 
    strTemp = strTemp & CheckStr(Request.ServerVariables("URL"))
    lenstrTemp=len(strTemp)+1	
	if instr(left(linkfile,lenstrTemp),"?")>0 then 
	
	if blockPage = 1 Then
		Response.Write "<span disabled>【←前10页</span>&nbsp;"
	Else
		Response.Write("<span disabled>【</span><a href=" & LinkFile & "&page="&blockPage-10&">←前10页</a>&nbsp;")
	End If
   i=1
   Do Until i > 28 or blockPage > n
    If blockPage=int(gopage) Then
		Response.Write("<font color=#FF0000>[<b>"&blockPage&"</b>]</font>")
	Else
		Response.Write(" <a href=" & LinkFile & "&page="&blockPage&">["&blockPage&"]</a> ")
    End If
    blockPage=blockPage+1
    i = i + 1
    Loop
	if blockPage > totalpage Then
		Response.Write "&nbsp;<span disabled>后10页→】"
	Else
		Response.Write("&nbsp;<a href=" & LinkFile & "&page="&blockPage&">后10页→</a><span disabled>】")
	End If 
	response.write" 直接到第 "
	response.write"<select onchange=if(this.options[this.selectedIndex].value!=''){location=this.options[this.selectedIndex].value;}>"
    for i=1 to totalpage
    response.write"<option value='" & LinkFile & "&page=" & i & "'"
    if i=gopage then response.write"selected"
    response.write">"&i&"</option>"
    next
    response.write"</select>"
    response.write" 页<Br><Br>"
	
	else
	
	if blockPage = 1 Then
		Response.Write "<span disabled>【←前10页</span>&nbsp;"
	Else
		Response.Write("<span disabled>【</span><a href=" & LinkFile & "?page="&blockPage-10&">←前10页</a>&nbsp;")
	End If
   i=1
   Do Until i > 28 or blockPage > n
    If blockPage=int(gopage) Then
		Response.Write("<font color=#FF0000>[<b>"&blockPage&"</b>]</font>")
	Else
		Response.Write(" <a href=" & LinkFile & "?page="&blockPage&">["&blockPage&"]</a> ")
    End If
    blockPage=blockPage+1
    i = i + 1
    Loop
	if blockPage > totalpage Then
		Response.Write "&nbsp;<span disabled>后10页→】"
	Else
		Response.Write("&nbsp;<a href=" & LinkFile & "?page="&blockPage&">后10页→</a><span disabled>】")
	End If 
	response.write" 直接到第 "
	response.write"<select onchange=if(this.options[this.selectedIndex].value!=''){location=this.options[this.selectedIndex].value;}>"
    for i=1 to totalpage
    response.write"<option value='" & LinkFile & "?page=" & i & "'"
    if i=gopage then response.write"selected"
    response.write">"&i&"</option>"
    next
    response.write"</select>"
    response.write" 页<Br><Br>"
	
	End If
	
	Startinfo=((gopage-1)*msg_per_page)+1
	Endinfo=gopage*msg_per_page
	if Endinfo>totalrec then Endinfo=totalrec
		Response.Write("&nbsp;&nbsp;共 "&totalrec&" 条信息 当前显示第 "&Startinfo&" - "&Endinfo&" 条 每页 "&msg_per_page&" 条信息 共 "&n&" 页")
end if
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'分页2
Function listPages2(LinkFile) 
   if not (rs.eof and rs.bof) then
	gopage=currentpage
	totalpage=n
	blockPage=Int((gopage-1)/28)*28+1
	
	If LCase(Request.ServerVariables("HTTPS")) = "off" Then 
    strTemp = "http://" 
    Else 
    strTemp = "https://" 
    End If 
    strTemp = strTemp & CheckStr(Request.ServerVariables("SERVER_NAME")) 
    If Request.ServerVariables("SERVER_PORT") <> 80 Then strTemp = strTemp & ":" & CheckStr(Request.ServerVariables("SERVER_PORT")) 
    strTemp = strTemp & CheckStr(Request.ServerVariables("URL"))
    lenstrTemp=len(strTemp)+1	
	if instr(left(linkfile,lenstrTemp),"?")>0 then 
	
	if blockPage = 1 Then
		Response.Write "<span disabled>前10页</span>&nbsp;"
	Else
		Response.Write("<a href=" & LinkFile & "&page="&blockPage-10&">前10页</a>&nbsp;")
	End If
   i=1
   Do Until i > 28 or blockPage > n
    If blockPage=int(gopage) Then
		Response.Write("<font color=#FF0000><b>"&blockPage&"</b></font>")
	Else
		Response.Write(" <a href=" & LinkFile & "&page="&blockPage&">"&blockPage&"</a> ")
    End If
    blockPage=blockPage+1
    i = i + 1
    Loop
	if blockPage > totalpage Then
		Response.Write "&nbsp;<span disabled>后10页"
	Else
		Response.Write("&nbsp;<a href=" & LinkFile & "&page="&blockPage&">后10页</a><span disabled>")
	End If 
	response.write" 直接到第 "
	response.write"<select onchange=if(this.options[this.selectedIndex].value!=''){location=this.options[this.selectedIndex].value;}>"
    for i=1 to totalpage
    response.write"<option value='" & LinkFile & "&page=" & i & "'"
    if i=gopage then response.write"selected"
    response.write">"&i&"</option>"
    next
    response.write"</select>"
    response.write" 页<Br><Br>"
	
	else
	
	if blockPage = 1 Then
		Response.Write "<span disabled>【←前10页</span>&nbsp;"
	Else
		Response.Write("<span disabled>【</span><a href=" & LinkFile & "?page="&blockPage-10&">←前10页</a>&nbsp;")
	End If
   i=1
   Do Until i > 28 or blockPage > n
    If blockPage=int(gopage) Then
		Response.Write("<font color=#FF0000>[<b>"&blockPage&"</b>]</font>")
	Else
		Response.Write(" <a href=" & LinkFile & "?page="&blockPage&">["&blockPage&"]</a> ")
    End If
    blockPage=blockPage+1
    i = i + 1
    Loop
	if blockPage > totalpage Then
		Response.Write "&nbsp;<span disabled>后10页→】"
	Else
		Response.Write("&nbsp;<a href=" & LinkFile & "?page="&blockPage&">后10页→</a><span disabled>】")
	End If 
	response.write" 直接到第 "
	response.write"<select onchange=if(this.options[this.selectedIndex].value!=''){location=this.options[this.selectedIndex].value;}>"
    for i=1 to totalpage
    response.write"<option value='" & LinkFile & "?page=" & i & "'"
    if i=gopage then response.write"selected"
    response.write">"&i&"</option>"
    next
    response.write"</select>"
    response.write" 页<Br><Br>"
	
	End If
	
	Startinfo=((gopage-1)*msg_per_page)+1
	Endinfo=gopage*msg_per_page
	if Endinfo>totalrec then Endinfo=totalrec
		Response.Write("&nbsp;&nbsp;共 "&totalrec&" 条信息 当前显示第 "&Startinfo&" - "&Endinfo&" 条 每页 "&msg_per_page&" 条信息 共 "&n&" 页")
end if
End Function

 '分页
Function listPages3(LinkFile) 
   if not (rs.eof and rs.bof) then
	gopage=currentpage
	totalpage=n
	blockPage=Int((gopage-1)/28)*28+1
 
	If LCase(Request.ServerVariables("HTTPS")) = "off" Then 
    strTemp = "http://" 
    Else 
    strTemp = "https://" 
    End If 
    strTemp = strTemp & CheckStr(Request.ServerVariables("SERVER_NAME")) 
    If Request.ServerVariables("SERVER_PORT") <> 80 Then strTemp = strTemp & ":" & CheckStr(Request.ServerVariables("SERVER_PORT")) 
    strTemp = strTemp & CheckStr(Request.ServerVariables("URL"))
    lenstrTemp=len(strTemp)+1	
	if instr(left(linkfile,lenstrTemp),"?")>0 then 
	
	if blockPage = 1 Then
		Response.Write "<span disabled>【←前10页</span>&nbsp;"
	Else
		Response.Write("<span disabled>【</span><a href=" & LinkFile & "&page="&blockPage-10&">←前10页</a>&nbsp;")
	End If
   i=1
   Do Until i > 28 or blockPage > n
    If blockPage=int(gopage) Then
		Response.Write("<font color=#FF0000>[<b>"&blockPage&"</b>]</font>")
	Else
		Response.Write(" <a href=" & LinkFile & "&page="&blockPage&">["&blockPage&"]</a> ")
    End If
    blockPage=blockPage+1
    i = i + 1
    Loop
	if blockPage > totalpage Then
		Response.Write "&nbsp;<span disabled>后10页→】"
	Else
		Response.Write("&nbsp;<a href=" & LinkFile & "&page="&blockPage&">后10页→</a><span disabled>】")
	End If 
	response.write" 直接到第 "
	response.write"<select onchange=if(this.options[this.selectedIndex].value!=''){location=this.options[this.selectedIndex].value;}>"
    for i=1 to totalpage
    response.write"<option value='" & LinkFile & "&page=" & i & "'"
    if i=gopage then response.write"selected"
    response.write">"&i&"</option>"
    next
    response.write"</select>"
    response.write" 页<Br><Br>"
	
	else
	
	if blockPage = 1 Then
		Response.Write "<span disabled>【←前10页</span>&nbsp;"
	Else
		Response.Write("<span disabled>【</span><a href=" & LinkFile & "?page="&blockPage-10&">←前10页</a>&nbsp;")
	End If
   i=1
   Do Until i > 28 or blockPage > n
    If blockPage=int(gopage) Then
		Response.Write("<font color=#FF0000>[<b>"&blockPage&"</b>]</font>")
	Else
		Response.Write(" <a href=" & LinkFile & "?page="&blockPage&">["&blockPage&"]</a> ")
    End If
    blockPage=blockPage+1
    i = i + 1
    Loop
	if blockPage > totalpage Then
		Response.Write "&nbsp;<span disabled>后10页→】"
	Else
		Response.Write("&nbsp;<a href=" & LinkFile & "?page="&blockPage&">后10页→</a><span disabled>】")
	End If 
	
	
	End If
	
	
end if
End Function'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 

'判断文件类型是否合格
Function CheckFileExt(FileExt)
	Dim ForumUpload,i
	ForumUpload="gif,jpg,bmp,jpeg,png"
	ForumUpload=Split(ForumUpload,",")
	CheckFileExt=False
	For i=0 to UBound(ForumUpload)
		If LCase(FileExt)=Lcase(Trim(ForumUpload(i))) Then
			CheckFileExt=True
			Exit Function
		End If
	Next
End Function

'格式后缀
Function FixName(UpFileExt)
	If IsEmpty(UpFileExt) Then Exit Function
	FixName = Lcase(UpFileExt)
	FixName = Replace(FixName,Chr(0),"")
	FixName = Replace(FixName,".","")
	FixName = Replace(FixName,"asp","")
	FixName = Replace(FixName,"asa","")
	FixName = Replace(FixName,"aspx","")
	FixName = Replace(FixName,"cer","")
	FixName = Replace(FixName,"cdx","")
	FixName = Replace(FixName,"htr","")
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'文件Content-Type判断
Function CheckFileType(FileType)
	CheckFileType = False
	If Left(Cstr(Lcase(Trim(FileType))),6)="image/" Then CheckFileType = True
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'获取IP地址
Function getIP()
    Dim strIPAddr
    If Request.ServerVariables("HTTP_X_FORWARDED_FOR") = "" OR InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), "unknown") > 0 Then
        strIPAddr = Request.ServerVariables("REMOTE_ADDR")
    ElseIf InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), ",") > 0 Then
        strIPAddr = Mid(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), 1, InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), ",")-1)
    ElseIf InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), ";") > 0 Then
        strIPAddr = Mid(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), 1, InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), ";")-1)
    Else
        strIPAddr = Request.ServerVariables("HTTP_X_FORWARDED_FOR")
    End If
    getIP = Trim(Mid(strIPAddr, 1, 30))
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'分离关键词中字符
function splitChar(str)
oldstring=str
newstring=""
oldsign=0
newsign=0
i=len(oldstring)
for j=1 to i 
if asc(mid(oldstring,j,1))<0  then
newsign=1
else 
newsign=0
end if
if j=1 then
oldsign=newsign
end if
if oldsign=newsign then
newstring=newstring+mid(oldstring,j,1)
else
newstring=newstring+" "+mid(oldstring,j,1)
end if
oldsign=newsign
next
splitChar=newstring
end function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'突出显示匹配搜索关键词字符
Function dispRed(str,Dstr)
Dstrgroup=Split(Dstr, " ", -1, 1)
for i=0 to UBound(Dstrgroup)
if InStr(1,str,Dstrgroup(i),1)<>0 then
str1=mid(str,InStr(1,str,Dstrgroup(i),1),len(Dstrgroup(i)))
str=replace(str,Dstrgroup(i),"<font color=red>"&str1&"</font>",1,-1,1)
end if
next
dispRed=str
end Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


'得到当前页面的地址 
Function GetUrls() 
 on error resume next 
Dim strTemp 
If LCase(Request.ServerVariables("HTTPS")) = "off" Then 
strTemp = "http://" 
Else 
strTemp = "https://" 
End If 
strTemp = strTemp & CheckStr(Request.ServerVariables("SERVER_NAME")) 
If Request.ServerVariables("SERVER_PORT") <> 80 Then strTemp = strTemp & ":" & CheckStr(Request.ServerVariables("SERVER_PORT")) 
strTemp = strTemp & CheckStr(Request.ServerVariables("URL")) 
If Trim(Request.QueryString) <> "" Then strTemp = strTemp & "?" & CheckStr(Trim(Request.QueryString)) 
GetUrls = strTemp  
End Function 

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


'URL数据获取
Function getUrl(url)
   dim Str
   dim Http
   dim Arr
   set Http=CreateObject("Microsoft.XMLHTTP")
   Http.open "GET",url,false
   Http.send()
   if Http.readystate<>4 then 
      exit function
   end if

   Str=bytesToBSTR(Http.responseBody,"GB2312")
   getUrl=Str
   set http=nothing
   if err.number<>0 then err.Clear 
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'格式化榨取数据
Function BytesToBstr(body,Cset)
   dim objstream
   set objstream = CreateObject("adodb.stream")
   objstream.Type = 1
   objstream.Mode =3
   objstream.Open
   objstream.Write body
   objstream.Position = 0
   objstream.Type = 2
   objstream.Charset = Cset
   BytesToBstr = objstream.ReadText 
   objstream.Close
   set objstream = nothing
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^



'==================================2007年2月3日 修改=====================================================
'wangyong 数据提交非法字符过滤
function HOPE_Str(hen)
    hen = replace(hen, ">", "&gt;")
    hen = replace(hen, "<", "&lt;")
    hen = Replace(hen, CHR(32), "&nbsp;")
    hen = Replace(hen, CHR(9), "&nbsp;")
    hen = Replace(hen, CHR(34), "&quot;")
    hen = Replace(hen, CHR(39), "&#39;")
    hen = Replace(hen, CHR(13), "")
    hen = Replace(hen, CHR(10) & CHR(10), "<p></p> ")
    hen = Replace(hen, CHR(10), "<br> ")
    HOPE_Str =hen
 end function 

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


'//网站操作结果信息提示(操作信息标题,操作信息结果,操作信息,操作信息返回地址)
Sub HOPE_err(Errinfotitle,Errinfo,ErrHostTitle,ErrHost)
response.write"<table cellpadding=2 cellspacing=1 border=0 width=100% class=tableBorder align=center>"
response.write"<TR>"
response.write"<TH class=tableHeaderText colSpan=2 height=25>"&Errinfotitle&"</TH>"
response.write"<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>"&Errinfo&"</div></td></tr>"
response.write"<tr align=center><td height=30 class=forumRowHighlight><a href='"&ErrHost&"'>"&ErrHostTitle&"</a></td>"
response.write"</tr>"
response.write"</table>"
End Sub

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'//生成静态文件删除(文件)
function FileDel(FileName) 
 on error resume next 
dim fso 
set fso=YXFSO
on error resume next
if fso.FileExists(Server.MapPath(FileName)) then 
	fso.DeleteFile server.MapPath(FileName),true   
 end if 
set fso=nothing 
end function 

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

'//生成文件夹删除(同时删除目录下的文件)
Function FSO_Del(FileName)
	Set fso = YXFSO
 	FilePath=server.mappath(FileName)
	on error resume next
 	If fso.FolderExists(FilePath) Then 
		Fso.DeleteFolder(FilePath)
	End if
	Set Fso=Nothing
End Function


 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^



 
'Call Operation(YX_Str1,1) '操作错误与/成功提示("提示内容",1为成功,0为失败) 
Sub Operation(Content,yx_Select)

YX_Str="<center><table width='506' height='25'  border='0' cellpadding='0' cellspacing='0' style='font-size:14px;'>"
YX_Str=YX_Str&"<tr>"
YX_Str=YX_Str&"  <td bgcolor='#73A2D6'><span style='color: #FFFFFF;font-size:14px;'><strong>&nbsp; [系统提示]</strong></span></td>"
YX_Str=YX_Str&"</tr></table><table width='506'  border='0' cellpadding='0' cellspacing='0' style='border:1px solid #73A2D6; '>"
YX_Str=YX_Str&"  <tr> <td><table width='95%'  border='0' align='center' cellpadding='0' cellspacing='5'>"
YX_Str=YX_Str&"    <tr>"
YX_Str=YX_Str&"      <td width='23%'>"
if yx_Select=1   then 
	yx_img="yixiang_ts_YEs.gif"
else
	yx_img="yixiang_ts.gif"
end if
YX_Str=YX_Str&" <img src='"&HOPE_InstallDir&"images/"&yx_img&"' width='105' height='103'>"
YX_Str=YX_Str&"  </td>"
YX_Str=YX_Str&"      <td width='77%'  style='font-size:14px;'>"&Content&"</td>"
YX_Str=YX_Str&"    </tr>"
YX_Str=YX_Str&"  </table></td>"  
YX_Str=YX_Str&"</tr></table>"

YX_Str=YX_Str&"<table width='506'  border='0' cellpadding='3' cellspacing='0' style='border-left:1px solid #73A2D6; border-Right:1px solid #73A2D6;border-Bottom:1px solid #73A2D6;'>"
YX_Str=YX_Str&"  <tr>"
YX_Str=YX_Str&" <td align='center'><input type='submit' name='Submit' value='返回首页'　style='border:1px solid #73A2D6;' onclick=""javascript:window.open('"&HOPE_InstallDir&"index.asp')""></td></tr>"
YX_Str=YX_Str&"</table>"
YX_Str=YX_Str&"<center>"
Response.write YX_Str
end Sub


 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^



'//删除当前ID的分页文件
Function Del_Page(FilePath,ID)
dim fs, folder, file, item, url,path 
path=Server.MapPath(FIlePath) '这里就是你说的文件夹的路径了 
set fs = YXFSO
set folder = fs.GetFolder(path) 
for each items in folder.Files 
url = items
 	if instr(url,ID&"-p")>0 and instr(url,".html")>0 then 
	 if fs.FileExists(url) then 
	  fs.DeleteFile url,true   
	 end if 
 	end if  
 next 
	Set fs=NOthing
End Function

 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^



function MapURL(path) 
dim rootPath, url 
rootPath = Server.MapPath("/") 
url = Right(path, Len(path) - Len(rootPath)-1) 
MapURL = Replace(url, "\", "/") 
end function 


 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Function Newstring(wstr,strng) '取字符串在目标字符串中位置
        Newstring=Instr(lcase(wstr),lcase(strng))
        if Newstring<=0 then Newstring=Len(wstr)
End Function



 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Function FunFolderSize(furl)
  Dim FSO,dir,strSize
  Set FSO = YXFSO
  On Error Resume Next
  If FSO.FolderExists(Server.MapPath(furl)) Then
  Set dir = FSO.GetFolder(Server.MapPath(furl))
  strSize =   round(dir.Size/1024,2)
  Set dir = Nothing
  Else
  strSize=0
  End If
  Set FSO = Nothing
  FunFolderSize = strSize
End Function

  
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

%>